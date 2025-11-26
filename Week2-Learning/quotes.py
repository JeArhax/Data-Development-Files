import requests
from bs4 import BeautifulSoup
import csv
import time

BASE_URL = "https://quotes.toscrape.com"
HEADERS = {"User-Agent": "Mozilla/5.0"}

def get_soup(url):
    response = requests.get(url, headers=HEADERS)
    response.encoding = "utf-8"
    return BeautifulSoup(response.text, "html.parser")

def scrape_page(url):
    soup = get_soup(url)

    quotes = soup.find_all("div", class_="quote")
    results = []

    for q in quotes:
        text = q.find("span", class_="text").text.strip()
        author = q.find("small", class_="author").text.strip()
        results.append({
            "text": text,
            "author": author,
            "pageUrl": url
        })

    next_btn = soup.find("li", class_="next")
    next_link = next_btn.find("a")["href"] if next_btn else None

    return results, next_link

def scrape_all():
    all_quotes = []
    next_page = "/"

    while next_page:
        current_url = BASE_URL + next_page
        print("Scraping:", current_url)

        page_quotes, next_link = scrape_page(current_url)

        if not page_quotes:
            print("No more quotes found. Stopping.")
            break

        all_quotes.extend(page_quotes)
        next_page = next_link

        time.sleep(0.3)

    csv_file = "quotes.csv"

    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "author", "pageUrl"])
        writer.writeheader()
        writer.writerows(all_quotes)

    print("Saved to", csv_file)

if __name__ == "__main__":
    scrape_all()
