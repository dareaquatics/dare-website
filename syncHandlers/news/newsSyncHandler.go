package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/sirupsen/logrus"
	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	gitHttp "github.com/go-git/go-git/v5/plumbing/transport/http"
)

const (
	newsURL      = "https://www.gomotionapp.com/team/cadas/page/news"
	baseURL      = "https://www.gomotionapp.com"
	newsHTMLFile = "news.html"
	startMarker  = "<!-- START UNDER HERE -->"
	endMarker    = "<!-- END AUTOMATION SCRIPT -->"
	timeFormat   = "January 2, 2006"
	concurrency  = 5
)

var (
	client = &http.Client{
		Timeout: 30 * time.Second,
	}
	log = logrus.New()
)

type Article struct {
	Title   string
	Date    string
	Author  string
	Content string
	URL     string
}

func main() {
	setupLogger()
	log.Info("starting news sync process")

	if os.Getenv("PAT_TOKEN") == "" {
		log.Fatal("missing PAT_TOKEN environment variable")
	}

	// Change working directory to repository root
	if err := os.Chdir("../../"); err != nil {
		log.Fatalf("failed to change directory: %v", err)
	}

	articleURLs, err := fetchArticleURLs()
	if err != nil {
		log.Errorf("failed to fetch article urls: %v", err)
		log.Info("sync process completed with errors - no changes made")
		os.Exit(0) // Exit successfully so workflow doesn't fail
	}

	articles := processArticles(articleURLs)
	if len(articles) == 0 {
		log.Info("no articles found")
		return
	}

	htmlContent := generateHTML(articles)
	modified, err := updateNewsHTML(htmlContent)
	if err != nil {
		log.Errorf("failed to update html: %v", err)
		log.Info("sync process completed with errors - no changes made")
		os.Exit(0)
	}

	if modified {
		if err := gitCommitAndPush(); err != nil {
			log.Errorf("failed to commit changes: %v", err)
			log.Info("sync process completed with errors - changes not pushed")
			os.Exit(0)
		}
	}

	log.Info("sync process completed successfully")
}

func setupLogger() {
	log.SetFormatter(&logrus.TextFormatter{
		ForceColors:   true,
		FullTimestamp: true,
	})
	log.SetLevel(logrus.InfoLevel)
}

func fetchArticleURLs() ([]string, error) {
	log.Info("fetching main news page")
	req, err := http.NewRequest("GET", newsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("request creation failed: %w", err)
	}

	setBrowserHeaders(req)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed (network error): %w", err)
	}
	defer resp.Body.Close()

	// Explicit handling of different HTTP status codes
	if resp.StatusCode != http.StatusOK {
		switch resp.StatusCode {
		case http.StatusForbidden:
			log.Errorf("HTTP 403 Forbidden - Access denied to news page")
			log.Error("Possible causes: IP blocked, rate limit exceeded, or site requires authentication")
			return nil, fmt.Errorf("access forbidden (403) - check permissions and rate limits")
		case http.StatusUnauthorized:
			log.Errorf("HTTP 401 Unauthorized - Authentication failed")
			return nil, fmt.Errorf("authentication failed (401) - invalid credentials")
		case http.StatusNotFound:
			log.Errorf("HTTP 404 Not Found - News page URL not found")
			log.Errorf("URL attempted: %s", newsURL)
			return nil, fmt.Errorf("resource not found (404) - check URL")
		case http.StatusTooManyRequests:
			log.Errorf("HTTP 429 Too Many Requests - Rate limit exceeded")
			return nil, fmt.Errorf("rate limit exceeded (429) - try again later")
		case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable:
			log.Errorf("HTTP %d - Server error on remote side", resp.StatusCode)
			return nil, fmt.Errorf("server error (%d) - remote service is down", resp.StatusCode)
		default:
			log.Errorf("HTTP %d - Unexpected status code from news page", resp.StatusCode)
			return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("html parsing failed: %w", err)
	}

	var urls []string
	doc.Find("div.Item:not(.Supplement) a[href]").Each(func(i int, s *goquery.Selection) {
		if href, exists := s.Attr("href"); exists {
			urls = append(urls, baseURL+href)
		}
	})

	log.Infof("found %d articles", len(urls))
	return urls, nil
}

func processArticles(urls []string) []Article {
	var wg sync.WaitGroup
	ch := make(chan string, concurrency)
	results := make(chan Article, len(urls))
	
	// Track errors
	var errorCount int32
	var errorMutex sync.Mutex

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range ch {
				article, err := fetchArticle(url)
				if err != nil {
					log.Warnf("failed to process %s: %v", url, err)
					errorMutex.Lock()
					errorCount++
					errorMutex.Unlock()
					continue
				}
				results <- article
			}
		}()
	}

	for _, url := range urls {
		ch <- url
	}
	close(ch)
	wg.Wait()
	close(results)

	var articles []Article
	for article := range results {
		articles = append(articles, article)
	}

	// Log error summary
	if errorCount > 0 {
		log.Warnf("failed to fetch %d out of %d articles", errorCount, len(urls))
	}
	
	if len(articles) == 0 && errorCount > 0 {
		log.Error("all articles failed to fetch - check network connectivity and site availability")
	}

	sortArticlesByDate(articles)
	return articles
}

func fetchArticle(articleURL string) (Article, error) {
	req, err := http.NewRequest("GET", articleURL, nil)
	if err != nil {
		return Article{}, fmt.Errorf("request creation failed: %w", err)
	}

	setBrowserHeaders(req)
	resp, err := client.Do(req)
	if err != nil {
		return Article{}, fmt.Errorf("request failed (network error): %w", err)
	}
	defer resp.Body.Close()

	// Handle HTTP errors for individual articles
	if resp.StatusCode != http.StatusOK {
		switch resp.StatusCode {
		case http.StatusForbidden:
			log.Warnf("HTTP 403 Forbidden for article: %s", articleURL)
			return Article{}, fmt.Errorf("access forbidden (403)")
		case http.StatusNotFound:
			log.Warnf("HTTP 404 Not Found for article: %s", articleURL)
			return Article{}, fmt.Errorf("article not found (404)")
		case http.StatusTooManyRequests:
			log.Warnf("HTTP 429 Rate limit exceeded for article: %s", articleURL)
			return Article{}, fmt.Errorf("rate limit exceeded (429)")
		default:
			log.Warnf("HTTP %d for article: %s", resp.StatusCode, articleURL)
			return Article{}, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
		}
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return Article{}, fmt.Errorf("html parsing failed: %w", err)
	}

	newsItem := doc.Find("div.NewsItem")
	if newsItem.Length() == 0 {
		return Article{}, fmt.Errorf("news item not found")
	}

	title := newsItem.Find("h1").Text()
	dateStr, _ := newsItem.Find("span.DateStr").Attr("data")
	author := newsItem.Find("div.Author strong").Text()
	content, _ := newsItem.Find("div.Content").Html()

	return Article{
		Title:   strings.TrimSpace(title),
		Date:    formatDate(dateStr, ""), // No timezone for news articles
		Author:  strings.TrimSpace(author),
		Content: processContent(content),
		URL:     articleURL,
	}, nil
}

func formatDate(timestamp string, tzid string) string {
	if timestamp == "" {
		return "Unknown Date"
	}

	// Handle Unix timestamps in milliseconds
	if unixMillis, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
		// Convert milliseconds to seconds
		t := time.Unix(unixMillis/1000, 0)
		return t.Format(timeFormat)
	}

	// Handle ICS dates with explicit timezone
	if tzid != "" {
		loc, err := time.LoadLocation(tzid)
		if err != nil {
			log.Warnf("unknown timezone: %s", tzid)
			return "Unknown Date"
		}

		// Parse ICS format (YYYYMMDDTHHMMSS)
		t, err := time.ParseInLocation("20060102T150405", timestamp, loc)
		if err == nil {
			return t.Format(timeFormat) + " (Local Time)"
		}
	}

	// Original handling for article dates (RFC3339)
	t, err := time.Parse(time.RFC3339, timestamp)
	if err == nil {
		return t.Format(timeFormat)
	}

	// Fallback for other formats
	log.Warnf("unable to parse timestamp: %s", timestamp)
	return "Unknown Date"
}

func processContent(html string) string {
	// FIRST: Replace images with links using regex (before goquery)
	imgRegex := regexp.MustCompile(`<img[^>]*\ssrc=["']([^"']+)["'][^>]*>`)
	html = imgRegex.ReplaceAllStringFunc(html, func(match string) string {
		srcRegex := regexp.MustCompile(`src=["']([^"']+)["']`)
		srcMatch := srcRegex.FindStringSubmatch(match)
		if len(srcMatch) < 2 {
			return ""
		}
		src := srcMatch[1]
		if !strings.HasPrefix(src, "http") {
			if strings.HasPrefix(src, "/") {
				src = baseURL + src
			} else {
				src = baseURL + "/" + src
			}
		}
		return fmt.Sprintf(`<a href="%s" target="_blank" rel="noopener noreferrer">Click to see image</a>`, src)
	})

	// Now parse with goquery for other operations
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return html
	}

	// Flatten headings to paragraphs
	doc.Find("h1,h2,h3,h4,h5,h6").Each(func(i int, s *goquery.Selection) {
		text := s.Text()
		s.ReplaceWithHtml(fmt.Sprintf(`<p class="news-paragraph">%s</p>`, text))
	})

	// Clean up existing links and make relative links absolute
	doc.Find("a[href]").Each(func(i int, s *goquery.Selection) {
		href, exists := s.Attr("href")
		if !exists || href == "" || href == "#" {
			s.ReplaceWithHtml(s.Text())
			return
		}

		// Make relative URLs absolute
		if !strings.HasPrefix(href, "http://") && !strings.HasPrefix(href, "https://") {
			if strings.HasPrefix(href, "/") {
				href = baseURL + href
			} else {
				href = baseURL + "/" + href
			}
		}

		s.SetAttr("href", href)
		s.SetAttr("target", "_blank")
		s.SetAttr("rel", "noopener noreferrer")
		
		// Replace text if it's a URL
		text := strings.TrimSpace(s.Text())
		if text == "" || text == href || strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://") {
			s.SetText("Click here to be redirected to the link")
		}
	})

	// Get the processed HTML
	html, _ = doc.Html()

	// LAST: Convert plain text URLs to links using regex
	// This regex finds URLs that are NOT already inside href="" attributes
	html = convertPlainTextURLsToLinks(html)

	// Clean up HTML
	html = regexp.MustCompile(`\s+`).ReplaceAllString(html, " ")
	html = regexp.MustCompile(`<br\s*/?>`).ReplaceAllString(html, "\n")
	html = regexp.MustCompile(`</li>\s*<li>`).ReplaceAllString(html, "</li><li>")

	return html
}

func convertPlainTextURLsToLinks(html string) string {
	// Find all URLs in text content (not in attributes)
	urlRegex := regexp.MustCompile(`>([^<]*\b(?:https?://[^\s<>"]+)[^<]*)<`)
	
	html = urlRegex.ReplaceAllStringFunc(html, func(match string) string {
		// Extract the text content between > and <
		text := match[1 : len(match)-1]
		
		// Find and replace URLs in this text
		urlPattern := regexp.MustCompile(`\b(https?://[^\s<>"]+)`)
		newText := urlPattern.ReplaceAllString(text, `<a href="$1" target="_blank" rel="noopener noreferrer">Click here to be redirected to the link</a>`)
		
		return ">" + newText + "<"
	})
	
	return html
}

func sortArticlesByDate(articles []Article) {
	sort.Slice(articles, func(i, j int) bool {
		t1, _ := time.Parse(timeFormat, articles[i].Date)
		t2, _ := time.Parse(timeFormat, articles[j].Date)
		return t1.After(t2)
	})
}

func generateHTML(articles []Article) string {
	var sb strings.Builder
	sb.WriteString("\n")

	for _, article := range articles {
		sb.WriteString(fmt.Sprintf(`
		<div class="news-item">
			<h2 class="news-title"><strong>%s</strong></h2>
			<p class="news-date">Author: %s</p>
			<p class="news-date">Published on %s</p>
			<div class="news-content">%s</div>
		</div>
		`, article.Title, article.Author, article.Date, article.Content))
	}

	return sb.String()
}

func updateNewsHTML(newContent string) (bool, error) {
	file, err := os.OpenFile(newsHTMLFile, os.O_RDWR, 0644)
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

	updated := html[:startIdx] + newContent + html[endIdx:]
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

func gitCommitAndPush() error {
	log.Info("committing changes to git")
	
	// Open the repository in the current working directory (repository root)
	repo, err := git.PlainOpen(".")
	if err != nil {
		return fmt.Errorf("repo open failed: %w", err)
	}

	wt, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("worktree access failed: %w", err)
	}

	// Check status before committing
	status, err := wt.Status()
	if err != nil {
		return fmt.Errorf("git status check failed: %w", err)
	}

	// If no changes, don't commit
	if status.IsClean() {
		log.Info("no changes to commit")
		return nil
	}

	if _, err := wt.Add(newsHTMLFile); err != nil {
		return fmt.Errorf("git add failed: %w", err)
	}

	_, err = wt.Commit("automated commit: sync TeamUnify news articles [skip ci]", &git.CommitOptions{
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

	// Try to push with retry logic for conflicts
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		err = repo.Push(&git.PushOptions{Auth: auth})
		if err == nil {
			log.Info("changes pushed successfully")
			return nil
		}

		// If it's not a conflict-related error, fail immediately
		if !strings.Contains(err.Error(), "non-fast-forward") && 
		   !strings.Contains(err.Error(), "rejected") {
			return fmt.Errorf("push failed: %w", err)
		}

		// For conflicts, try to pull and retry
		if attempt < maxRetries {
			log.Warnf("push failed (attempt %d/%d), trying to pull and retry: %v", attempt, maxRetries, err)
			
			// Pull with rebase
			pullErr := wt.Pull(&git.PullOptions{
				Auth:         auth,
				RemoteName:   "origin",
				ReferenceName: "refs/heads/main", // Adjust if your branch is different
			})
			
			if pullErr != nil && pullErr.Error() != "already up-to-date" {
				log.Warnf("pull failed: %v", pullErr)
			}
			
			time.Sleep(time.Duration(attempt) * time.Second) // Exponential backoff
			continue
		}

		return fmt.Errorf("push failed after %d attempts: %w", maxRetries, err)
	}

	return fmt.Errorf("push failed after %d attempts", maxRetries)
}

func setBrowserHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Referer", baseURL)
}
