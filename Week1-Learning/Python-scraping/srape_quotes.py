import requests
from bs4 import BeautifulSoup
import csv

r = requests.get('https://quotes.toscrape.com')
r.encoding = 'utf-8'

soup = BeautifulSoup(r.text, 'html.parser')

quotes = soup.find_all('div', class_='quote')

formatted_quotes = []

for q in quotes:
    text = q.find('span', class_='text').get_text(strip=True)
    author = q.find('small', class_='author').get_text(strip=True)
    formatted_quotes.append({
        'text': text,
        'author': author,
       
    })

# --- SAVE TO CSV ---
csv_file = "quotes.csv"

with open(csv_file, "w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(file, fieldnames=["text", "author"])
    writer.writeheader()
    writer.writerows(formatted_quotes)

print("Saved to", csv_file)
