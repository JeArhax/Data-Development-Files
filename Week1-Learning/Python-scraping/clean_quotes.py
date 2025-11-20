import csv
import pandas as pd

quotes = pd.read_csv(r"C:\Users\lenovo\OneDrive\Desktop\Internship\quotes.csv")

# --- FIX unkwown characters in excel ---
def fix_mojibake(s):
    try:
        return s.encode("latin1").decode("utf8")
    except:
        return s  # fallback if already clean

quotes["text"] = quotes["text"].apply(fix_mojibake)
quotes["author"] = quotes["author"].apply(fix_mojibake)

# lowercase column
quotes["text_lower"] = quotes["text"].str.lower()
quotes["text_lower"] = quotes["text_lower"].apply(fix_mojibake)

print(quotes.head())

# getting the columns of the dataset
columns = list(quotes.columns)
print(columns)

# examining missing values
print("Missing values distribution:")
print(quotes.isnull().mean())
print("")

# check datatype in each column
print("Column datatypes: ")
print(quotes.dtypes)

# getting all the columns with string/mixed type values
str_cols = list(quotes.select_dtypes(include=['object']).columns)

# removing leading and trailing characters from columns with str type
for col in str_cols:
    quotes[col] = quotes[col].str.strip()


quotes = quotes.drop_duplicates()

quotes["text_lower"] = quotes["text"].str.lower()

quotes_clean = r"C:\Users\lenovo\OneDrive\Desktop\Internship\quotes_clean.csv"
quotes.to_csv(quotes_clean, index=False, encoding="utf-8 sig")

print("CLEAN CSV SAVED AS", quotes_clean)