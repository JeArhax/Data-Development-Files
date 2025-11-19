import requests
from bs4 import BeautifulSoup

r = requests.get('https://news.ycombinator.com')
soup = BeautifulSoup(r.text, 'html.parser')
links = soup.findAll('tr', class_='athing')

formatted_links = []

for link in links:
    data = {
        'id': link['id'],
        'title': link.find_all('td')[2].a.text,
        "url": link.find_all('td')[2].a['href'],
        "rank": int(link.find_all('td')[0].span.text.replace('.', ''))
    }
    formatted_links.append(data)

print(formatted_links)

# save csv
import csv

# Sample data
data = [
    {'id': '1', 'title': 'Post 1', 'url': 'http://example.com/1', 'rank': 1},
    {'id': '2', 'title': 'Post 2', 'url': 'http://example.com/2', 'rank': 2}
]

# Define the CSV file path
csv_file = 'hacker_news_posts.csv'

# Write data to CSV
with open(csv_file, 'w', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=['id', 'title', 'url', 'rank'])
    writer.writeheader()
    for row in data:
        writer.writerow(row)



        