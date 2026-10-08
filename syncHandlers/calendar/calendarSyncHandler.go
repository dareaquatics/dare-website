package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	gitHttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/sirupsen/logrus"
)

// The Commit Swimming feed URL contains access tokens, so it is read from the
// COMMIT_CALENDAR_URL secret instead of being committed to this public repo.
const (
	timezone      = "America/Los_Angeles"
	eventsHTML    = "calendar/index.html"
	calendarJSON  = "assets/data/calendar.json"
	deadlinesJSON = "assets/data/meet-deadlines.json"
	startMarker   = "<!-- START UNDER HERE -->"
	endMarker     = "<!-- END AUTOMATION SCRIPT -->"
	commitMessage = "automated commit: sync Commit Swimming calendar [skip ci]"
)

var client = &http.Client{
	Timeout: 30 * time.Second,
}

var loc *time.Location

var poBox = regexp.MustCompile(`(?i)\bp\.?\s*o\.?\s*box\b`)

// rawEvent is one VEVENT with its properties unfolded and unescaped.
type rawEvent struct {
	uid, summary, description, location string
	start, end, stamp                   time.Time
	allDay                              bool
	rrule                               map[string]string
	exdates                             []string
}

// Item is a meet or team event shown in the schedule.
type Item struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	Title       string `json:"title"`
	Start       string `json:"start"`
	End         string `json:"end"`
	AllDay      bool   `json:"allDay"`
	Place       string `json:"place,omitempty"`
	Address     string `json:"address,omitempty"`
	Description string `json:"description,omitempty"`
}

// Slot is one weekly recurring practice time for a group.
type Slot struct {
	Days    []string `json:"days"`
	Start   string   `json:"start"`
	End     string   `json:"end"`
	Place   string   `json:"place,omitempty"`
	Address string   `json:"address,omitempty"`
	From    string   `json:"from"`
	Until   string   `json:"until,omitempty"`
	Except  []string `json:"except,omitempty"`
}

type Group struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Slots []Slot `json:"slots"`
}

type Calendar struct {
	Updated   string  `json:"updated"`
	Timezone  string  `json:"timezone"`
	Items     []Item  `json:"items"`
	Practices []Group `json:"practices"`
}

type DeadlineEntry struct {
	Name     string  `json:"name"`
	Dates    string  `json:"dates"`
	Deadline *string `json:"deadline"`
}

type DeadlineFile struct {
	HowTo string                   `json:"howTo"`
	Meets map[string]DeadlineEntry `json:"meets"`
}

func main() {
	log := setupLogger()
	log.Info("starting calendar sync process")

	if os.Getenv("PAT_TOKEN") == "" {
		log.Fatal("missing PAT_TOKEN environment variable")
	}
	feedURL := os.Getenv("COMMIT_CALENDAR_URL")
	if feedURL == "" {
		log.Fatal("missing COMMIT_CALENDAR_URL environment variable")
	}

	var err error
	if loc, err = time.LoadLocation(timezone); err != nil {
		log.Fatalf("timezone load failed: %v", err)
	}

	// Change working directory to repository root
	if err := os.Chdir("../../"); err != nil {
		log.Fatalf("failed to change directory: %v", err)
	}

	events, err := fetchEvents(feedURL, log)
	if err != nil {
		// Log the error but don't fail - allows the workflow to complete gracefully
		log.Errorf("failed to fetch events: %v", err)
		log.Info("sync process completed with errors - no changes made")
		os.Exit(0) // Exit successfully so workflow doesn't fail
	}

	now := time.Now().In(loc)
	cal := buildCalendar(events, now)
	log.Infof("found %d upcoming meets/events and %d practice groups", len(cal.Items), len(cal.Practices))

	writers := []struct {
		path  string
		write func() (bool, error)
	}{
		{calendarJSON, func() (bool, error) { return writeJSON(calendarJSON, cal) }},
		{deadlinesJSON, func() (bool, error) { return updateDeadlines(cal.Items) }},
		{eventsHTML, func() (bool, error) { return updateHTMLContent(generateHTML(cal.Items), log) }},
	}
	var changed []string
	for _, w := range writers {
		modified, err := w.write()
		if err != nil {
			log.Errorf("failed to update %s: %v", w.path, err)
			log.Info("sync process completed with errors - changes not pushed")
			os.Exit(0)
		}
		if modified {
			changed = append(changed, w.path)
		}
	}

	if len(changed) == 0 {
		log.Info("no changes detected")
	} else if err := gitCommitAndPush(changed, log); err != nil {
		log.Errorf("failed to commit changes: %v", err)
		log.Info("sync process completed with errors - changes not pushed")
		os.Exit(0)
	}

	log.Info("sync process completed successfully")
}

func setupLogger() *logrus.Logger {
	log := logrus.New()
	log.SetFormatter(&logrus.TextFormatter{
		ForceColors:   true,
		FullTimestamp: true,
	})
	log.SetLevel(logrus.InfoLevel)
	return log
}

func fetchEvents(feedURL string, log *logrus.Logger) ([]rawEvent, error) {
	log.Info("fetching ics data")
	resp, err := client.Get(feedURL)
	if err != nil {
		// Don't wrap err: its text includes the URL, which holds the feed tokens.
		return nil, fmt.Errorf("ics fetch failed (network error)")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		switch resp.StatusCode {
		case http.StatusForbidden, http.StatusUnauthorized:
			return nil, fmt.Errorf("access denied (%d) - the calendar link may have been reset in Commit", resp.StatusCode)
		case http.StatusNotFound:
			return nil, fmt.Errorf("feed not found (404) - check COMMIT_CALENDAR_URL")
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("rate limit exceeded (429) - try again later")
		default:
			return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ics read failed: %w", err)
	}
	events, err := parseICS(body)
	if err != nil {
		return nil, fmt.Errorf("ics parse failed: %w", err)
	}
	log.Infof("parsed %d events", len(events))
	return events, nil
}

// parseICS reads the subset of iCalendar that Commit Swimming publishes.
func parseICS(data []byte) ([]rawEvent, error) {
	var lines []string
	sc := bufio.NewScanner(bytes.NewReader(data))
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), "\r")
		// Long lines are folded onto continuation lines that start with a space.
		if (strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")) && len(lines) > 0 {
			lines[len(lines)-1] += line[1:]
			continue
		}
		lines = append(lines, line)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	var events []rawEvent
	var cur *rawEvent
	for _, line := range lines {
		switch line {
		case "BEGIN:VEVENT":
			cur = &rawEvent{}
			continue
		case "END:VEVENT":
			if cur != nil && cur.uid != "" && !cur.start.IsZero() {
				if cur.end.IsZero() {
					cur.end = cur.start
				}
				events = append(events, *cur)
			}
			cur = nil
			continue
		}
		if cur == nil {
			continue
		}

		colon := strings.Index(line, ":")
		if colon < 0 {
			continue
		}
		head, value := line[:colon], line[colon+1:]
		parts := strings.Split(head, ";")
		name := strings.ToUpper(parts[0])
		params := map[string]string{}
		for _, p := range parts[1:] {
			if kv := strings.SplitN(p, "=", 2); len(kv) == 2 {
				params[strings.ToUpper(kv[0])] = kv[1]
			}
		}

		switch name {
		case "UID":
			cur.uid = strings.TrimSuffix(value, "@commitswimming.com")
		case "SUMMARY":
			cur.summary = unescape(value)
		case "DESCRIPTION":
			cur.description = unescape(value)
		case "LOCATION":
			cur.location = unescape(value)
		case "DTSTAMP":
			cur.stamp, _ = parseTime(value, params)
		case "DTSTART":
			t, err := parseTime(value, params)
			if err != nil {
				return nil, fmt.Errorf("event %s: %w", cur.uid, err)
			}
			cur.start = t
			cur.allDay = params["VALUE"] == "DATE"
		case "DTEND":
			t, err := parseTime(value, params)
			if err != nil {
				return nil, fmt.Errorf("event %s: %w", cur.uid, err)
			}
			cur.end = t
		case "RRULE":
			cur.rrule = map[string]string{}
			for _, kv := range strings.Split(value, ";") {
				if p := strings.SplitN(kv, "=", 2); len(p) == 2 {
					cur.rrule[strings.ToUpper(p[0])] = p[1]
				}
			}
		case "EXDATE":
			for _, v := range strings.Split(value, ",") {
				if t, err := parseTime(v, params); err == nil {
					cur.exdates = append(cur.exdates, t.Format("2006-01-02"))
				}
			}
		}
	}
	return events, nil
}

func unescape(s string) string {
	r := strings.NewReplacer(`\n`, "\n", `\N`, "\n", `\,`, ",", `\;`, ";", `\\`, `\`)
	return strings.TrimSpace(r.Replace(s))
}

func parseTime(value string, params map[string]string) (time.Time, error) {
	if params["VALUE"] == "DATE" || len(value) == 8 {
		return time.ParseInLocation("20060102", value, loc)
	}
	if strings.HasSuffix(value, "Z") {
		t, err := time.Parse("20060102T150405Z", value)
		return t.In(loc), err
	}
	zone := loc
	if tzid := params["TZID"]; tzid != "" {
		if z, err := time.LoadLocation(tzid); err == nil {
			zone = z
		}
	}
	t, err := time.ParseInLocation("20060102T150405", value, zone)
	return t.In(loc), err
}

// splitLocation turns "Granada Pool — 2233 Whitney Drive, Alhambra" into a
// place name and an address. Meet locations are usually just an address.
func splitLocation(s string) (place, address string) {
	// A P.O. Box is a mailing address, not somewhere to drive to.
	if poBox.MatchString(s) {
		return "", ""
	}
	for _, sep := range []string{" — ", " – "} {
		if i := strings.Index(s, sep); i > 0 {
			return strings.TrimSpace(s[:i]), strings.TrimSpace(s[i+len(sep):])
		}
	}
	return "", strings.TrimSpace(s)
}

func buildCalendar(events []rawEvent, now time.Time) Calendar {
	cal := Calendar{Timezone: timezone, Items: []Item{}, Practices: []Group{}}
	groups := map[string]*Group{}
	var groupOrder []string
	var latest time.Time

	for _, ev := range events {
		if ev.stamp.After(latest) {
			latest = ev.stamp
		}
		place, address := splitLocation(ev.location)

		if strings.HasPrefix(ev.uid, "regGroupSchedule-") {
			slot, ok := practiceSlot(ev, place, address)
			if !ok {
				continue
			}
			// UID looks like regGroupSchedule-<groupId>-<slotId>
			id := strings.SplitN(strings.TrimPrefix(ev.uid, "regGroupSchedule-"), "-", 2)[0]
			if groups[id] == nil {
				name := strings.TrimSpace(strings.TrimSuffix(ev.summary, " - DARE Aquatics"))
				groups[id] = &Group{ID: id, Name: name}
				groupOrder = append(groupOrder, id)
			}
			groups[id].Slots = append(groups[id].Slots, slot)
			continue
		}

		kind := "event"
		end := ev.end
		if strings.HasPrefix(ev.uid, "meet-") {
			kind = "meet"
			// Meet times in Commit are placeholders; a meet runs through its last day.
			end = time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, loc)
		}
		// Skip anything that has already finished.
		if end.Before(now) {
			continue
		}
		// Commit writes all-day events as 00:00 to 23:59:59.
		allDay := ev.allDay || (ev.start.Hour() == 0 && ev.start.Minute() == 0 && (ev.end.Hour() == 23 || ev.end.Equal(ev.start)))
		cal.Items = append(cal.Items, Item{
			ID:          ev.uid,
			Kind:        kind,
			Title:       strings.Join(strings.Fields(ev.summary), " "),
			Start:       ev.start.Format(time.RFC3339),
			End:         end.Format(time.RFC3339),
			AllDay:      allDay,
			Place:       place,
			Address:     address,
			Description: ev.description,
		})
	}

	cal.Items = dedupe(cal.Items)
	sort.SliceStable(cal.Items, func(i, j int) bool { return cal.Items[i].Start < cal.Items[j].Start })

	for _, id := range groupOrder {
		g := groups[id]
		sort.SliceStable(g.Slots, func(i, j int) bool { return g.Slots[i].From < g.Slots[j].From })
		cal.Practices = append(cal.Practices, *g)
	}
	if !latest.IsZero() {
		cal.Updated = latest.Format(time.RFC3339)
	}
	return cal
}

func practiceSlot(ev rawEvent, place, address string) (Slot, bool) {
	slot := Slot{
		Start:   ev.start.Format("15:04"),
		End:     ev.end.Format("15:04"),
		Place:   place,
		Address: address,
		From:    ev.start.Format("2006-01-02"),
		Except:  ev.exdates,
	}
	if ev.rrule == nil {
		// One-off practice: it only happens on its start day.
		slot.Days = []string{weekdayCode(ev.start.Weekday())}
		slot.Until = slot.From
		return slot, true
	}
	if ev.rrule["FREQ"] != "WEEKLY" {
		return slot, false
	}
	if byDay := ev.rrule["BYDAY"]; byDay != "" {
		slot.Days = strings.Split(byDay, ",")
	} else {
		slot.Days = []string{weekdayCode(ev.start.Weekday())}
	}
	if until := ev.rrule["UNTIL"]; len(until) >= 8 {
		if t, err := time.ParseInLocation("20060102", until[:8], loc); err == nil {
			slot.Until = t.Format("2006-01-02")
		}
	}
	return slot, true
}

func weekdayCode(d time.Weekday) string {
	return []string{"SU", "MO", "TU", "WE", "TH", "FR", "SA"}[d]
}

// dedupe drops a team event when a meet with the same name starts the same day,
// since Commit lists meets DARE hosts under both.
func dedupe(items []Item) []Item {
	meets := map[string]bool{}
	for _, it := range items {
		if it.Kind == "meet" {
			meets[strings.ToLower(it.Title)+it.Start[:10]] = true
		}
	}
	out := items[:0]
	for _, it := range items {
		if it.Kind == "event" && meets[strings.ToLower(it.Title)+it.Start[:10]] {
			continue
		}
		out = append(out, it)
	}
	return out
}

// updateDeadlines keeps meet-deadlines.json listing every upcoming meet so
// coaches only need to fill in the "deadline" value. Existing deadlines are kept.
func updateDeadlines(items []Item) (bool, error) {
	file := DeadlineFile{}
	if data, err := os.ReadFile(deadlinesJSON); err == nil {
		if err := json.Unmarshal(data, &file); err != nil {
			return false, fmt.Errorf("%s is not valid JSON: %w", deadlinesJSON, err)
		}
	}
	if file.Meets == nil {
		file.Meets = map[string]DeadlineEntry{}
	}
	file.HowTo = `Set "deadline" to the entry deadline as "YYYY-MM-DD" (it closes at the end of that day, Pacific time). Leave it null if it isn't known yet. New meets are added here automatically by the calendar sync.`

	upcoming := map[string]bool{}
	for _, it := range items {
		if it.Kind != "meet" {
			continue
		}
		upcoming[it.ID] = true
		entry := file.Meets[it.ID]
		entry.Name = it.Title
		entry.Dates = formatRange(it)
		file.Meets[it.ID] = entry
	}
	for id := range file.Meets {
		if !upcoming[id] {
			delete(file.Meets, id)
		}
	}
	return writeJSON(deadlinesJSON, file)
}

func writeJSON(path string, v any) (bool, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return false, err
	}
	old, _ := os.ReadFile(path)
	if bytes.Equal(old, buf.Bytes()) {
		return false, nil
	}
	if err := os.MkdirAll("assets/data", 0755); err != nil {
		return false, err
	}
	return true, os.WriteFile(path, buf.Bytes(), 0644)
}

func formatRange(it Item) string {
	start, _ := time.Parse(time.RFC3339, it.Start)
	end, _ := time.Parse(time.RFC3339, it.End)
	start, end = start.In(loc), end.In(loc)
	switch {
	case start.Format("2006-01-02") == end.Format("2006-01-02"):
		return start.Format("Mon, Jan 2, 2006")
	case start.Year() != end.Year():
		return start.Format("Jan 2, 2006") + " – " + end.Format("Jan 2, 2006")
	case start.Month() != end.Month():
		return start.Format("Jan 2") + " – " + end.Format("Jan 2, 2006")
	default:
		return start.Format("Jan 2") + "–" + end.Format("2, 2006")
	}
}

func mapsLink(address string) string {
	return "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(address)
}

// generateHTML renders one row per meet or event. calendar.js hides rows that
// have finished and moves the next one into the "Next up" card.
func generateHTML(items []Item) string {
	if len(items) == 0 {
		return "\n" + `<li class="ev-empty">No meets or events are scheduled yet. Check back soon.</li>`
	}
	var b strings.Builder
	for _, it := range items {
		start, _ := time.Parse(time.RFC3339, it.Start)
		start = start.In(loc)

		kind := "Team event"
		if it.Kind == "meet" {
			kind = "Meet"
		}
		// Meet times in Commit are placeholders, so only team events show a time.
		when := formatRange(it)
		if !it.AllDay && it.Kind != "meet" {
			end, _ := time.Parse(time.RFC3339, it.End)
			when += ", " + strings.ToLower(start.Format("3:04pm")) + "–" + strings.ToLower(end.In(loc).Format("3:04pm"))
		}

		where, directions, desc := "", "", ""
		if it.Address != "" {
			label := it.Address
			if it.Place != "" {
				label = it.Place + ", " + it.Address
			}
			where = fmt.Sprintf(`
    <p class="ev-where">%s</p>`, html.EscapeString(label))
			directions = fmt.Sprintf(`
      <a class="btn btn--ghost" href="%s" target="_blank" rel="noopener noreferrer"><i class="bi bi-geo-alt" aria-hidden="true"></i> Directions</a>`,
				html.EscapeString(mapsLink(it.Address)))
		}
		if it.Description != "" {
			desc = fmt.Sprintf(`
    <p class="ev-desc">%s</p>`, strings.ReplaceAll(html.EscapeString(it.Description), "\n", "<br />"))
		}

		fmt.Fprintf(&b, `
<li class="ev ev--%s" data-start="%s" data-end="%s">
  <time class="ev-date" datetime="%s"><span class="ev-month">%s</span><span class="ev-day">%s</span></time>
  <div class="ev-body">
    <p class="ev-kind">%s<span class="ev-countdown"></span></p>
    <h3 class="ev-title">%s</h3>
    <p class="ev-when">%s</p>%s%s
    <div class="ev-actions">
      <a class="btn btn--primary" href="https://team.commitswimming.com/sign-in" target="_blank" rel="noopener noreferrer">More details</a>%s
    </div>
  </div>
</li>`,
			it.Kind, it.Start, it.End,
			start.Format("2006-01-02"), start.Format("Jan"), start.Format("2"),
			kind, html.EscapeString(it.Title), when, where, desc, directions)
	}
	return b.String()
}

func updateHTMLContent(newContent string, log *logrus.Logger) (bool, error) {
	content, err := os.ReadFile(eventsHTML)
	if err != nil {
		return false, fmt.Errorf("file read failed: %w", err)
	}

	page := string(content)
	startIdx := strings.Index(page, startMarker)
	endIdx := strings.Index(page, endMarker)
	if startIdx == -1 || endIdx == -1 {
		return false, fmt.Errorf("markers not found in html")
	}
	startIdx += len(startMarker)

	updated := page[:startIdx] + newContent + "\n" + page[endIdx:]
	if updated == page {
		return false, nil
	}
	if err := os.WriteFile(eventsHTML, []byte(updated), 0644); err != nil {
		return false, fmt.Errorf("file write failed: %w", err)
	}
	log.Info("html file updated successfully")
	return true, nil
}

func gitCommitAndPush(paths []string, log *logrus.Logger) error {
	log.Info("committing changes to git")
	repo, err := git.PlainOpen(".")
	if err != nil {
		return fmt.Errorf("repo open failed: %w", err)
	}

	wt, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("worktree access failed: %w", err)
	}

	for _, p := range paths {
		if _, err := wt.Add(p); err != nil {
			return fmt.Errorf("git add %s failed: %w", p, err)
		}
	}

	_, err = wt.Commit(commitMessage, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "github-actions[bot]",
			Email: "github-actions[bot]@users.noreply.github.com",
			When:  time.Now(),
		},
	})
	if err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}

	auth := &gitHttp.BasicAuth{
		Username: "github-actions",
		Password: os.Getenv("PAT_TOKEN"),
	}

	if err := repo.Push(&git.PushOptions{Auth: auth}); err != nil {
		return fmt.Errorf("push failed: %w", err)
	}

	log.Info("changes pushed successfully")
	return nil
}
