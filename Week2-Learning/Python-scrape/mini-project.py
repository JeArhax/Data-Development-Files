import requests
from bs4 import BeautifulSoup
import json
import csv
import time
import random

BASE_URL = "https://books.toscrape.com"

HEADERS_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 Safari/605.1.15"
]

def get_soup(url):
    headers = {"User-Agent": random.choice(HEADERS_LIST)}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    return BeautifulSoup(response.text, "html.parser")

def scrape_category(cat_url, cat_name):
    books = []
    next_page = cat_url

    while next_page:
        soup = get_soup(next_page)
        book_elements = soup.select("article.product_pod")

        for b in book_elements:
            title = b.h3.a["title"]
            price = b.select_one("p.price_color").text.strip()
            availability = b.select_one("p.instock.availability").text.strip()
            img_tag = b.select_one("div.image_container img")
            image_url = BASE_URL + "/" + img_tag["src"].replace("../", "") if img_tag else ""
            
            books.append({
                "title": title,
                "category": cat_name,
                "price": price,
                "availability": availability,
                "image_url": image_url
            })

        # Next page
        next_btn = soup.select_one("li.next a")
        if next_btn:
            next_page = BASE_URL + "/catalogue/category/books/" + cat_url.split("category/books/")[1].split("/")[0] + "/" + next_btn['href']
            time.sleep(random.uniform(0.5, 1.5))
        else:
            next_page = None

    return books

def main():
    # Get categories
    soup = get_soup(BASE_URL)
    cat_links = soup.select("div.side_categories ul li ul li a")
    categories = [{"name": a.text.strip(), "url": BASE_URL + "/" + a['href']} for a in cat_links]

    all_books = []

    for cat in categories:
        print("Scraping category:", cat["name"])
        cat_books = scrape_category(cat["url"], cat["name"])
        all_books.extend(cat_books)

    # Save JSON
    with open("books.json", "w", encoding="utf-8") as f:
        json.dump(all_books, f, ensure_ascii=False, indent=2)

    # Save CSV
    keys = all_books[0].keys()
    with open("books.csv", "w", newline="", encoding="utf-8-sig") as f:
        dict_writer = csv.DictWriter(f, keys)
        dict_writer.writeheader()
        dict_writer.writerows(all_books)

    print(f"Scraping finished: {len(all_books)} books")
    print("Saved books.json and books.csv")

if __name__ == "__main__":
    main()
