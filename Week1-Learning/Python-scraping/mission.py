import requests
from bs4 import BeautifulSoup
import json
import csv
import time

BASE_URL = "https://data.iowaagriculture.gov/licensing_lists/veterinarians/"
HEADERS = {"User-Agent": "Mozilla/5.0"}

def write_jsonl(path, data):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")

def clean(s):
    return " ".join(s.split()).strip() if s else None

def parse_row(row, page_url):
    cells = row.find_all("td")
    if len(cells) < 6:
        return None

    return {
        "licenseNumber": clean(cells[0].text),
        "fullName": clean(cells[1].text),
        "city": clean(cells[2].text),
        "state": clean(cells[3].text),
        "expirationDate": clean(cells[4].text),
        "licenseStatus": clean(cells[5].text),
        "currentPageUrl": page_url,
        "sourceUrl": BASE_URL
    }

def scrape_offset(offset):
    payload = {
        "offset": offset,
        "LicenseNumber": "",
        "name": "",
        "city": "",
        "LicenseStatus": "All"
    }

    print(f"Scraping offset: {offset}")

    response = requests.post(BASE_URL, data=payload, headers=HEADERS)
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.find("table")
    if not table:
        print("No table found — stopping.")
        return []

    tbody = table.find("tbody")
    if tbody:
        rows = tbody.find_all("tr")
    else:
        rows = table.find_all("tr")[1:]  

    results = []
    for r in rows:
        parsed = parse_row(r, BASE_URL)
        if parsed:
            results.append(parsed)

    return results

def scrape_all():
    jsonl_file = "veterinarians.jsonl"
    csv_file = "veterinarians.csv"

    open(jsonl_file, "w").close()

    all_data = []
    offset = 0
    step = 25 

    while True:
        page_data = scrape_offset(offset)

        if not page_data:
            print("No more data. Ending scrape.")
            break

        for row in page_data:
            write_jsonl(jsonl_file, row)

        all_data.extend(page_data)

        offset += step
        time.sleep(0.3)

    if not all_data:
        print("No data scraped.")
        return

    fieldnames = list(all_data[0].keys())

    with open(csv_file, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames)
        writer.writeheader()
        writer.writerows(all_data)

    print("\nDone!")
    print("->", jsonl_file)
    print("->", csv_file)

if __name__ == "__main__":
    scrape_all()
