# -----------------------------------------------------------------------------------------------------------------------
# MODIFIED VERSION OF https://github.com/luryann/sync/blob/main/autosync.py DESIGNED FOR GITHUB ACTIONS WORKFLOWS
# -----------------------------------------------------------------------------------------------------------------------

import os
import cloudscraper
from bs4 import BeautifulSoup
from datetime import datetime
from git import Repo
import logging
import colorlog
import re

# Constants
GITHUB_REPO = 'https://github.com/dareaquatics/dare-website.git'
FILE_PATH = 'news.html'  # Path relative to the repository root
NEWS_URL = 'https://www.gomotionapp.com/team/cadas/page/news'
GITHUB_TOKEN = ${{ secrets.PAT_TOKEN }}  # Read from environment variable

# Setup colored logging
handler = colorlog.StreamHandler()
handler.setFormatter(colorlog.ColoredFormatter(
    '%(log_color)s%(asctime)s - %(levelname)s - %(message)s',
    log_colors={
        'DEBUG': 'cyan',
        'INFO': 'green',
        'WARNING': 'yellow',
        'ERROR': 'red',
        'CRITICAL': 'bold_red',
    }
))
logging.basicConfig(level=logging.DEBUG, handlers=[handler])


# Fetch the latest news from the website
def fetch_news():
    try:
        logging.info("Fetching news from TeamUnify using bypass...")
        scraper = cloudscraper.create_scraper()
        response = scraper.get(NEWS_URL)
        response.raise_for_status()

        logging.debug(f"Fetched HTML content: {response.text[:2000]}")  # Log first 2000 characters of HTML for analysis

        soup = BeautifulSoup(response.content, 'html.parser')

        news_items = []

        articles = soup.find_all('div', class_='Item')
        logging.debug(f"Found {len(articles)} articles in total")

        for article in articles:
            if 'Supplement' in article.get('class', []):
                logging.debug("Skipping Supplement item")
                continue  # Skip articles with class 'Item Supplement'

            try:
                logging.debug(f"Processing article: {article.prettify()[:500]}")  # Log first 500 characters of each article for inspection
                title = article.find('h4').text.strip() if article.find('h4') else 'No Title'
                date_element = article.find('span', class_='DateStr')
                date_str = date_element.get('data') if date_element else None
                summary = article.find('p').text.strip() if article.find('p') else 'No Summary'
                author_element = article.find('span', class_='Author')
                author = author_element.text.strip() if author_element else 'Unknown Author'

                if date_str:
                    date_obj = datetime.utcfromtimestamp(int(date_str) / 1000)  # Convert from milliseconds to seconds
                    formatted_date = date_obj.strftime('%B %d, %Y')
                else:
                    logging.warning(f"Date not found for article with title: {title}")
                    formatted_date = 'Unknown Date'

                news_items.append({
                    'title': title,
                    'date': formatted_date,
                    'summary': summary,
                    'author': author
                })
            except Exception as e:
                logging.error(f"Error parsing article: {e}")

        # Sort news_items by date in ascending order
        news_items.sort(
            key=lambda x: datetime.strptime(x['date'], '%B %d, %Y') if x['date'] != 'Unknown Date' else datetime.min)

        logging.info("Successfully fetched and parsed news items.")
        return news_items

    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching news: {e}")
        return []


# Convert URLs in text to clickable links
def convert_links_to_clickable(text):
    url_pattern = re.compile(r'(https?://\S+)')
    return url_pattern.sub(r'<a href="\1">\1</a>', text)


# Generate HTML for news items
def generate_html(news_items):
    logging.info("Generating HTML for news items...")
    news_html = ''

    for item in news_items:
        summary_with_links = convert_links_to_clickable(item["summary"])
        news_html += f'''
        <div class="news-item">
            <h2 class="news-title"><strong>{item["title"]}</strong></h2>
            <p class="news-date">Published on {item["date"]}</p>
            <p class="news-author">Author: {item["author"]}</p>
            <p class="news-content">{summary_with_links}</p>
        </div>
        '''

    logging.info("Successfully generated HTML.")
    return news_html


# Update the HTML file with new news items
def update_html_file(news_html):
    try:
        logging.info("Updating HTML file...")
        if not os.path.exists(FILE_PATH):
            logging.error(f"File not found: {FILE_PATH}")
            return

        with open(FILE_PATH, 'r', encoding='utf-8') as file:
            content = file.read()

        # Define markers for the section to be replaced
        start_marker = '<!-- START UNDER HERE -->'
        end_marker = '<!-- END AUTOMATION SCRIPT -->'
        start_index = content.find(start_marker) + len(start_marker)
        end_index = content.find(end_marker)

        if start_index == -1 or end_index == -1:
            logging.error("Markers not found in the HTML file.")
            return

        # Update the content between markers
        updated_content = content[:start_index] + '\n' + news_html + '\n' + content[end_index:]

        with open(FILE_PATH, 'w', encoding='utf-8') as file:
            file.write(updated_content)
        logging.info("Successfully updated HTML file.")

    except IOError as e:
        logging.error(f"Error updating HTML file: {e}")


# Commit and push the changes to GitHub
def push_to_github():
    try:
        logging.info("Pushing changes to GitHub...")
        repo = Repo(os.getcwd())  # Use current working directory
        repo.git.add(FILE_PATH)
        repo.index.commit('automated:: update news.html')
        origin = repo.remote(name='origin')
        origin.push()
        logging.info("Successfully pushed changes to GitHub.")
    except Exception as e:
        logging.error(f"Error pushing changes to GitHub: {e}")


# Main function to run the update process
def main():
    logging.info("Starting update process...")

    news_items = fetch_news()

    if not news_items:
        logging.error("No news items fetched. Aborting update process.")
        return

    news_html = generate_html(news_items)

    update_html_file(news_html)

    push_to_github()

    logging.info("Update process completed.")


if __name__ == "__main__":
    main()
