import requests
from bs4 import BeautifulSoup
import csv

r = requests.get('https://quotes.toscrape.com')
r.encoding = 'utf-8'
soup = BeautifulSoup(r.text, 'html.parser')

links = soup.find_all('div', class_='quote')

formatted_links = []

for link in links:
    data = {
        'text': link.find('span', class_='text').text,
        'author': link.find('small', class_='author').text
    }
    formatted_links.append(data)

# --- SAVE TO CSV ---
csv_file = "quotes.csv"

with open(csv_file, "w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(file, fieldnames=["text", "author"])
    writer.writeheader()
    writer.writerows(formatted_links)

print("Saved to", csv_file)
