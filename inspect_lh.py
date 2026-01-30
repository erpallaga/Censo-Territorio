import pandas as pd
import os

folder = "L'Hospitalet"
geom_file = "TERRITORI_DIVISIONS_BAR.csv"
pop_file = "06ff0a2d-f6f8-4bf5-9ac1-ed09fda42a8b.csv"

print("--- Geometry File ---")
try:
    # Verify delimiter
    with open(os.path.join(folder, geom_file), 'r', encoding='latin1') as f:
        header = f.readline().strip()
        print(f"Header raw: {header}")
    
    # Read with pipe delimiter if detected
    sep = '|' if '|' in header else ','
    geo_df = pd.read_csv(os.path.join(folder, geom_file), encoding='latin1', sep=sep)
    print("Columns:", geo_df.columns.tolist())
    print("First 3 rows:")
    print(geo_df.head(3))
    
    # Check for potential join keys
    print("\nPotential Keys in Geometry:")
    if 'CodiBarri' in geo_df.columns:
        print("Unique CodiBarri:", geo_df['CodiBarri'].unique())
    elif 'Codi' in geo_df.columns:
        print("Unique Codi:", geo_df['Codi'].unique())
    # Just print first few cols unique values to be sure
    for col in geo_df.columns[:5]:
        print(f"Unique {col}: {geo_df[col].unique()[:10]}")
        
except Exception as e:
    print(f"Error reading geometry: {e}")

print("\n--- Population File ---")
try:
    pop_df = pd.read_csv(os.path.join(folder, pop_file))
    print("Columns:", pop_df.columns.tolist())
    
    # detailed check
    print("\nSample Data:")
    print(pop_df.head(3))
    
    print("\nUnique Years:", pop_df['AnyPadro'].unique())
    
    # Check join keys
    if 'CodiBarri' in pop_df.columns:
        print("Unique CodiBarri:", pop_df['CodiBarri'].unique())
        
except Exception as e:
    print(f"Error reading population: {e}")
