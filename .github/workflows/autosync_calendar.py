name: Update Calendar

on:
  workflow_dispatch:
    inputs:
      force_update:
        description: 'Force update the calendar'
        required: false
        default: 'false'
  schedule:
    - cron: '0 0 * * *' # Runs daily at midnight

jobs:
  update-calendar:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install ics gitpython colorlog requests tqdm pytz

      - name: Run the script
        env:
          PAT_TOKEN: ${{ secrets.PAT_TOKEN }} # GitHub PAT Token stored in Actions secrets
        run: |
          python autosync_calendar.py
