from http.server import BaseHTTPRequestHandler
import json
import sys
import os
import traceback

# Walk up from this file's directory to find the folder that contains _shared/
_dir = os.path.dirname(os.path.abspath(__file__))
_candidate = _dir
for _ in range(4):
    if os.path.isdir(os.path.join(_candidate, '_shared')):
        sys.path.insert(0, _candidate)
        break
    _parent = os.path.dirname(_candidate)
    if _parent == _candidate:
        break
    _candidate = _parent
else:
    sys.path.insert(0, _dir)

from _shared.data_loader import get_city_data
from _shared.census_calculator import get_census_zones_geojson


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            
            city = params.get('city', ['barcelona'])[0]
            sample_str = params.get('sample', [None])[0]
            sample_size = int(sample_str) if sample_str else None
            
            city_data = get_city_data()
            
            if city not in city_data:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'City {city} not found'}).encode())
                return
            
            data = city_data[city]
            geojson = get_census_zones_geojson(
                data['geo_df'], data['pop_df'],
                sample_size=sample_size,
                city_config=data['config']
            )
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(geojson).encode())
            
        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"Error in census-zones: {error_trace}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': str(e),
                'traceback': error_trace
            }).encode())
