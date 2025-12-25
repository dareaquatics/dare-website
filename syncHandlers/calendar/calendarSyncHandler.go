package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/apognu/gocal"
	"github.com/sirupsen/logrus"
	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	gitHttp "github.com/go-git/go-git/v5/plumbing/transport/http"
)

const (
	icsURL        = "https://www.gomotionapp.com/rest/ics/system/5/Events.ics?key=l4eIgFXwqEbxbQz42YjRgg%3D%3D&enabled=false&tz=America%2FLos_Angeles"
	timezone      = "America/Los_Angeles"
	eventsHTML    = "calendar.html"
	startMarker   = "<!-- START UNDER HERE -->"
	endMarker     = "<!-- END AUTOMATION SCRIPT -->"
	commitMessage = "automated commit: sync TeamUnify calendar [skip ci]"
)

func main() {
	log := setupLogger()
	log.Info("starting calendar sync process")

	if os.Getenv("PAT_TOKEN") == "" {
		log.Fatal("missing PAT_TOKEN environment variable")
	}

	// Change working directory to repository root
	if err := os.Chdir("../../"); err != nil {
		log.Fatalf("failed to change directory: %v", err)
	}

	events, err := fetchEvents(log)
	if err != nil {
		// Log the error but don't fail - allows the workflow to complete gracefully
		log.Errorf("failed to fetch events: %v", err)
		log.Info("sync process completed with errors - no changes made")
		os.Exit(0) // Exit successfully so workflow doesn't fail
	}

	htmlContent := generateHTML(events, log)
	modified, err := updateHTMLContent(htmlContent, log)
	if err != nil {
		log.Errorf("failed to update html: %v", err)
		log.Info("sync process completed with errors - no changes made")
		os.Exit(0)
	}

	if modified {
		if err := gitCommitAndPush(log); err != nil {
			log.Errorf("failed to commit changes: %v", err)
			log.Info("sync process completed with errors - changes not pushed")
			os.Exit(0)
		}
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

func fetchEvents(log *logrus.Logger) ([]gocal.Event, error) {
	log.Info("fetching ics data")
	resp, err := http.Get(icsURL)
	if err != nil {
		return nil, fmt.Errorf("ics fetch failed (network error): %w", err)
	}
	defer resp.Body.Close()

	// Explicit handling of different HTTP status codes
	if resp.StatusCode != http.StatusOK {
		switch resp.StatusCode {
		case http.StatusForbidden:
			log.Errorf("HTTP 403 Forbidden - Access denied to ICS feed")
			log.Error("Possible causes: API key expired, rate limit exceeded, or permissions changed")
			return nil, fmt.Errorf("access forbidden (403) - check API key and permissions")
		case http.StatusUnauthorized:
			log.Errorf("HTTP 401 Unauthorized - Authentication failed")
			return nil, fmt.Errorf("authentication failed (401) - invalid credentials")
		case http.StatusNotFound:
			log.Errorf("HTTP 404 Not Found - ICS feed URL not found")
			return nil, fmt.Errorf("resource not found (404) - check URL")
		case http.StatusTooManyRequests:
			log.Errorf("HTTP 429 Too Many Requests - Rate limit exceeded")
			return nil, fmt.Errorf("rate limit exceeded (429) - try again later")
		case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable:
			log.Errorf("HTTP %d - Server error on remote side", resp.StatusCode)
			return nil, fmt.Errorf("server error (%d) - remote service is down", resp.StatusCode)
		default:
			log.Errorf("HTTP %d - Unexpected status code", resp.StatusCode)
			return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, fmt.Errorf("timezone load failed: %w", err)
	}

	parser := gocal.NewParser(resp.Body)
	if err := parser.Parse(); err != nil {
		log.Errorf("failed to parse ICS data: %v", err)
		return nil, fmt.Errorf("ics parse failed: %w", err)
	}

	for i := range parser.Events {
		start := parser.Events[i].Start.In(loc)
		end := parser.Events[i].End.In(loc)
		parser.Events[i].Start = &start
		parser.Events[i].End = &end
	}

	sort.Slice(parser.Events, func(i, j int) bool {
		return parser.Events[i].Start.Before(*parser.Events[j].Start)
	})

	log.Infof("processed %d events", len(parser.Events))
	return parser.Events, nil
}

func generateHTML(events []gocal.Event, log *logrus.Logger) string {
	log.Info("generating html content")

	if len(events) == 0 {
		return `<div class="event"><p>No upcoming events published.</p></div>`
	}

	var content strings.Builder
	now := time.Now().In(time.UTC)
	hasUpcoming := false

	for _, event := range events {
		// Skip past events
		if event.End.Before(now) {
			continue
		}

		hasUpcoming = true
		content.WriteString(fmt.Sprintf(`
		<div class="event">
		  <h2><strong>%s</strong></h2>
		  <p><b>Event Start:</b> %s</p>
		  <p><b>Event End:</b> %s</p>
		  <br>
		  <p>Click the button below for more information.</p>
		  <a href="https://www.gomotionapp.com/team/cadas/controller/cms/admin/index?team=cadas#/calendar-team-events" 
		     target="_blank" 
		     rel="noopener noreferrer" 
		     class="btn btn-primary">
		    More Details
		  </a>
		</div>
		<br><br>`,
			event.Summary,
			event.Start.Format("January 02, 2006"),
			event.End.Format("January 02, 2006"),
		))
	}

	if !hasUpcoming {
		content.WriteString(`<div class="event"><p>No upcoming events published.</p></div>`)
	}

	return content.String()
}

func updateHTMLContent(newContent string, log *logrus.Logger) (bool, error) {
	log.Info("updating html file")
	file, err := os.OpenFile(eventsHTML, os.O_RDWR, 0644)
	if err != nil {
		return false, fmt.Errorf("file open failed: %w", err)
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return false, fmt.Errorf("file read failed: %w", err)
	}

	html := string(content)
	startIdx := strings.Index(html, startMarker) + len(startMarker)
	endIdx := strings.Index(html, endMarker)

	if startIdx == -1 || endIdx == -1 {
		return false, fmt.Errorf("markers not found in html")
	}

	updated := html[:startIdx] + "\n" + newContent + "\n" + html[endIdx:]
	if updated == html {
		log.Info("no changes detected")
		return false, nil
	}

	if err := file.Truncate(0); err != nil {
		return false, fmt.Errorf("file truncate failed: %w", err)
	}

	if _, err := file.Seek(0, 0); err != nil {
		return false, fmt.Errorf("file seek failed: %w", err)
	}

	if _, err := file.WriteString(updated); err != nil {
		return false, fmt.Errorf("file write failed: %w", err)
	}

	log.Info("html file updated successfully")
	return true, nil
}

func gitCommitAndPush(log *logrus.Logger) error {
	log.Info("committing changes to git")
	repo, err := git.PlainOpen(".") 
	if err != nil {
		return fmt.Errorf("repo open failed: %w", err)
	}

	wt, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("worktree access failed: %w", err)
	}

	if _, err := wt.Add(eventsHTML); err != nil {
		return fmt.Errorf("git add failed: %w", err)
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
