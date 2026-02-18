from http.server import BaseHTTPRequestHandler
import json
import sys
import os
import traceback

# Add api/ directory to path for _shared imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _shared.data_loader import get_city_data
from _shared.census_calculator import parse_wkt_polygon
import pandas as pd


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Extract city and key from path: /api/zone-stats/[city]/[key]
            parts = self.path.strip('/').split('/')
            # Expected: api / zone-stats / <city> / <key>
            if len(parts) < 4:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Invalid path'}).encode())
                return
            
            city = parts[2]
            key = parts[3].split('?')[0]  # Remove query params if any
            
            city_data = get_city_data()
            
            if city not in city_data:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'City {city} not found'}).encode())
                return
            
            data = city_data[city]
            config = data['config']
            
            # Try to match key type
            try:
                key_val = int(key)
            except ValueError:
                key_val = key
            
            pop_row = data['pop_df'][data['pop_df'][config['join_key_pop']] == key_val]
            
            if pop_row.empty:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Zone not found in population data'}).encode())
                return
            
            p_row = pop_row.iloc[0]
            
            # Get geometry
            secc_row = data['geo_df'][data['geo_df'][config['join_key_geo']] == key_val]
            
            if secc_row.empty:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Zone geometry not found'}).encode())
                return
            
            s_row = secc_row.iloc[0]
            wkt = s_row[config['col_geometry']]
            poly = parse_wkt_polygon(wkt)
            coords = [[float(coord[0]), float(coord[1])] for coord in poly]
            
            result = {
                'population': int(p_row['Valor']),
                'district': str(s_row.get(config['col_district'], '')),
                'neighborhood': str(s_row.get(config['col_neighborhood'], '')),
                'geo_key': str(key_val),
                'geojson': {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    }
                }
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"Error in zone-stats: {error_trace}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
