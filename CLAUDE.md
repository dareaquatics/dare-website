# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static website for DARE Aquatics (competitive swim team), hosted on GitHub Pages. Frontend is vanilla HTML/CSS/JS with Bootstrap 5. Two Go sync handlers automate content updates from an external GoMotion platform.

## Commands

### Go Sync Handlers

```bash
# Run calendar sync manually
cd syncHandlers/calendar && go run calendarSyncHandler.go

# Run news sync manually
cd syncHandlers/news && go run newsSyncHandler.go

# Update Go dependencies
go mod tidy && go mod download
```

There is no build step for the frontend — it deploys directly as static files via GitHub Pages.

## Architecture

### Frontend: Shared Layout Pattern

Root HTML pages are thin shells. Shared UI (nav, header, footer, loading screen) lives in `/partials/` and is injected at runtime by `layoutLoader.js` using `[data-include]` attributes.

**Root page contract:**
- Page content goes in `<main id="main">`
- Set `body[data-page]` for nav highlighting
- Add `body[data-announcement="true"]` when an announcement should show
- Page-specific CSS: `/assets/css/pages/<page>.css`
- Page-specific JS: `/assets/js/pages/<page>.js`

`layoutLoader.js` handles: fetching and caching partials, activating nav state, loading the announcement system, and injecting page-specific scripts.

### Announcement System

Controlled by `/config.yaml`. The loader reads this config and manages show/hide state via localStorage.

### Go Sync Handlers

Two Go services poll GoMotion (the team management platform) and write generated HTML directly into `calendar.html` and `news.html` between automation markers. **Do not remove these markers:**

```html
<!-- START UNDER HERE -->
<!-- END AUTOMATION SCRIPT -->
```

Both handlers commit directly to Git if content differs. They run on scheduled GitHub Actions (calendar: hourly, news: hourly).

### Deployment

GitHub Actions (`controlledDeploy.yaml`) deploys to GitHub Pages on push to `main`, but only if changed files are in the root or `assets/` directory — changes to `.github/`, Go files, or config files alone do not trigger a deploy.

### Must follow instructions:
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:
 
Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
 
Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
 
Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
 
Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.
 
Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character
 
Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>

If you are unsure or recieve any vague or ambigious answer, you must ask clarifying questions until you fully understand the request. It is critical that you do so, do not proceed with vague or ambigious answers!.