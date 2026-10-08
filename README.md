DARE Aquatics 

Official website for DARE Aquatics. Hosted on GitHub Pages instance. Licensed under GPLv3.

[![CodeQL](https://github.com/dareaquatics/dare-website/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/dareaquatics/dare-website/actions/workflows/github-code-scanning/codeql)[![GitHub Pages](https://github.com/dareaquatics/dare-website/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/dareaquatics/dare-website/actions/workflows/pages/pages-build-deployment)
[![Sync Calendar](https://github.com/dareaquatics/dare-website/actions/workflows/calendarSyncHandler.yaml/badge.svg)](https://github.com/dareaquatics/dare-website/actions/workflows/calendarSyncHandler.yaml)
[![Dependabot Updates](https://github.com/dareaquatics/dare-website/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/dareaquatics/dare-website/actions/workflows/dependabot/dependabot-updates)
[![Weekly Snapshot](https://github.com/dareaquatics/dare-website/actions/workflows/snapshot.yaml/badge.svg)](https://github.com/dareaquatics/dare-website/actions/workflows/snapshot.yaml)

```
TAG:
NNwNNa = Automated release for snapshotting purposes triggered by GitHub Actions workflow.
vNN.N = Manual release triggered by a maintainer.


RELEASE TITLE:
NNNNNNNNNN = Automated release for snapshotting purposes triggered by GitHub Actions workflow.
MM.YYYY = Manual release triggered by a maintainer.





202512250640549wDHDpYn
```

## Maintainability Structure

This repository uses a shared-layout pattern for root pages:

- Shared fragments live in `/partials`:
  - `/partials/site-head-common.html`
  - `/partials/site-header.html`
  - `/partials/site-footer.html`
  - `/partials/loading-screen.html`
  - `/partials/site-scripts.html`
- Root content pages and directory index pages (for example `index.html`, `calendar/index.html`, `documents/index.html`) are thin shells that include those partials via `data-include`.
- `/assets/js/layoutLoader.js` is responsible for:
  - Loading include fragments.
  - Activating nav state based on `body[data-page]`.
  - Loading announcement dependencies when `body[data-announcement="true"]`.
  - Loading page-specific scripts (`/assets/js/pages/*`) after shared scripts.

## Root Page Contract

For root pages that use the shared layout:

1. Keep page-specific content inside a single `<main id="main">...</main>`.
2. Set `data-page` on `<body>` to match nav activation keys.
3. Add `data-announcement="true"` on `<body>` only when announcement UI is needed.
4. Use:
   - `<template data-include="/partials/site-head-common.html"></template>` in `<head>`.
   - `<div data-include="..."></div>` placeholders in `<body>` for shared sections.
5. Keep per-page CSS in `/assets/css/pages/<page>.css`.
6. Keep per-page JS in `/assets/js/pages/<page>.js`.

## Calendar Automation Contract

`syncHandlers/calendar` pulls the Commit Swimming calendar feed and writes:

- `assets/data/calendar.json`: upcoming meets and events, plus weekly practice times per group. The calendar page's practice finder reads this.
- `assets/data/meet-deadlines.json`: one entry per upcoming meet. New meets are added automatically; set each `"deadline"` to `"YYYY-MM-DD"` by hand to show it in the entry-deadline list.
- `calendar/index.html`: the meets and events list, between these markers (do not remove or rename them):
  - `<!-- START UNDER HERE -->`
  - `<!-- END AUTOMATION SCRIPT -->`

The feed URL contains access tokens, so it is stored in the `COMMIT_CALENDAR_URL` repository secret rather than in code.
