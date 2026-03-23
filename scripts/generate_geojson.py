"""
Run this script once locally to pre-generate static GeoJSON files for each city.
Output goes to public/geojson/{city}.json and must be committed to the repo.

Usage:
    cd /path/to/Censo-Territorio
    python scripts/generate_geojson.py
"""
import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api._shared.data_loader import get_city_data
from api._shared.census_calculator import get_census_zones_geojson

output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'geojson')
os.makedirs(output_dir, exist_ok=True)

print("Loading city data...")
city_data = get_city_data()

for city, data in city_data.items():
    print(f"Generating GeoJSON for {city}...")
    geojson = get_census_zones_geojson(data['geo_df'], data['pop_df'], city_config=data['config'])
    path = os.path.join(output_dir, f'{city}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False)
    size_kb = os.path.getsize(path) / 1024
    print(f"  -> {path}: {len(geojson['features'])} features, {size_kb:.0f} KB")

print("Done.")
