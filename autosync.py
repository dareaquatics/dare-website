# -----------------------------------------------------------------------------------------------------------------------
# MODIFIED VERSION OF https://github.com/luryann/sync/blob/main/autosync.py DESIGNED FOR GITHUB ACTIONS WORKFLOWS
# -----------------------------------------------------------------------------------------------------------------------
import os
import shutil
import platform
import cloudscraper
from bs4 import BeautifulSoup
from datetime import datetime
from git import Repo, GitCommandError
import logging
import colorlog
import re
import requests
from tqdm import tqdm

# Constants
GITHUB_REPO = os.getenv('GITHUB_REPOSITORY', 'https://github.com/dareaquatics/dare-website')
NEWS_URL = 'https://www.gomotionapp.com/team/cadas/page/news'
PAT_TOKEN = os.getenv('PAT_TOKEN')
REPO_NAME = 'dare-website'
NEWS_HTML_FILE = 'news.html'

# Setup colored logging
handler = colorlog.StreamHandler()
handler.setFormatter(colorlog.ColoredFormatter(
    '%(log_color)s%(asctime)s - %(levelname)s - %(message)s',
    log_colors={
        'DEBUG': 'cyan',
        'INFO': 'green',
        'WARNING': 'red',
        'ERROR': 'bold_red',
        'CRITICAL': 'bold_red',
    }
))
logging.basicConfig(level=logging.DEBUG, handlers=[handler])

# Function definitions (same as before, except using PAT_TOKEN)
def check_github_token_validity():
    try:
        headers = {
            'Authorization': f'token {PAT_TOKEN}'
        }
        repo_path = GITHUB_REPO.replace("https://github.com/", "")
        api_url = f'https://api.github.com/repos/{repo_path}'
        response = requests.get(api_url, headers=headers)
        if response.status_code == 200:
            logging.info("GitHub token is valid.")
        else:
            logging.error("Invalid GitHub token.")
            exit(1)
    except Exception as e:
        logging.error(f"Error validating GitHub token: {e}")
        exit(1)
        def fetch_news():
    try:
        logging.info("Fetching news from TeamUnify using bypass...")
        scraper = cloudscraper.create_scraper()
        response = scraper.get(NEWS_URL)
        response.raise_for_status()

        logging.debug(f"Fetched HTML content: {response.text[:2000]}")

        soup = BeautifulSoup(response.content, 'html.parser')

        news_items = []

        articles = soup.find_all('div', class_='Item')
        logging.debug(f"Found {len(articles)} articles in total")

        for article in articles:
            if 'Supplement' in article.get('class', []):
                logging.debug("Skipping Supplement item")
                continue

            try:
                title = article.find('h4').text.strip() if article.find('h4') else 'No Title'
                logging.debug(f"Processing article: {title}")
                date_element = article.find('span', class_='DateStr')
                date_str = date_element.get('data') if date_element else None
                summary = article.find('p').text.strip() if article.find('p') else 'No Summary'
                author_element = article.find('span', class_='Author')
                author = author_element.text.strip() if author_element else 'Unknown Author'

                if date_str:
                    date_obj = datetime.utcfromtimestamp(int(date_str) / 1000)
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

        news_items.sort(
            key=lambda x: datetime.strptime(x['date'], '%B %d, %Y') if x['date'] != 'Unknown Date' else datetime.min, reverse=True)

        logging.info("Successfully fetched and parsed news items.")
        return news_items

    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching news: {e}")
        return []


def convert_links_to_clickable(text):
    url_pattern = re.compile(r'(https?://\S+)')
    return url_pattern.sub(r'<a href="\1">\1</a>', text)


def generate_html(news_items):
    logging.info("Generating HTML for news items...")
    news_html = ''

    for item in news_items:
        summary_with_links = convert_links_to_clickable(item["summary"])
        news_html += f'''
        <div class="news-item">
            <h2 class="news-title"><strong>{item["title"]}</strong></h2>
            <p class="news-date">Author: {item["author"]}</p>
            <p class="news-date">Published on {item["date"]}</p>
            <p class="news-content">{summary_with_links}</p>
        </div>
        '''

    logging.info("Successfully generated HTML.")
    return news_html


def update_html_file(news_html):
    try:
        if not os.path.exists(NEWS_HTML_FILE):
            logging.error(f"HTML file '{NEWS_HTML_FILE}' not found in the repository.")
            return

        logging.info("Updating HTML file...")
        with open(NEWS_HTML_FILE, 'r', encoding='utf-8') as file:
            content = file.read()

        start_marker = '<!-- START UNDER HERE -->'
        end_marker = '<!-- END AUTOMATION SCRIPT -->'
        start_index = content.find(start_marker) + len(start_marker)
        end_index = content.find(end_marker)

        if start_index == -1 or end_index == -1:
            logging.error("Markers not found in the HTML file.")
            return

        updated_content = content[:start_index] + '\n' + news_html + '\n' + content[end_index:]

        with open(NEWS_HTML_FILE, 'w', encoding='utf-8') as file:
            file.write(updated_content)
        logging.info("Successfully updated HTML file.")

    except IOError as e:
        logging.error(f"Error updating HTML file: {e}")


def push_to_github():
    try:
        logging.info("Pushing changes to GitHub...")
        repo = Repo(os.getcwd())

        if repo.is_dirty(untracked_files=True):
            with tqdm(total=100, desc='Committing changes') as pbar:
                def update_commit_pbar(cur_count, max_count=None, message=''):
                    if max_count:
                        pbar.total = max_count
                    pbar.update(cur_count - pbar.n)
                    pbar.set_postfix_str(message)

                repo.git.add(NEWS_HTML_FILE)
                repo.index.commit('Automation: Sync TeamUnify Events w/ GitHub')
                pbar.update(100)

            origin = repo.remote(name='origin')
            with tqdm(total=100, desc='Pushing changes') as pbar:
                def update_push_pbar(op_code, cur_count, max_count=None, message=''):
                    if max_count:
                        pbar.total = max_count
                    pbar.update(cur_count - pbar.n)
                    pbar.set_postfix_str(message)

                origin.push(progress=update_push_pbar)
            logging.info("Successfully pushed changes to GitHub.")
        else:
            logging.info("No changes to commit.")

    except GitCommandError as e:
        logging.error(f"Git command error: {e}")
    except Exception as e:
        logging.error(f"Error pushing changes to GitHub: {e}")


def main():
    try:
        logging.info("Starting update process...")

        check_github_token_validity()

        if not check_git_installed():
            if not download_portable_git():
                logging.error("Unable to install Git. Aborting process.")
                return

        clone_repository()

        news_items = fetch_news()

        if not news_items:
            logging.error("No news items fetched. Aborting update process.")
            return

        news_html = generate_html(news_items)

        update_html_file(news_html)

        push_to_github()

        logging.info("Update process completed.")
    except Exception as e:
        logging.error(f"Update process failed: {e}")
        logging.info("Update process aborted due to errors.")


if __name__ == "__main__":
    main()
