from http.server import BaseHTTPRequestHandler
import json
import sys
import os
import traceback
import cgi

# Add api/ directory to path for _shared imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _shared.data_loader import get_city_data
from _shared.census_calculator import (
    parse_kml_polygon,
    calcular_poblacion_interseccion,
    get_zone_statistics
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse multipart form data
            content_type = self.headers.get('Content-Type', '')
            
            if 'multipart/form-data' not in content_type:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Expected multipart/form-data'}).encode())
                return
            
            # Parse the multipart data
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Use cgi module to parse multipart
            environ = {
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE': content_type,
                'CONTENT_LENGTH': str(content_length),
            }
            
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ=environ
            )
            
            if 'kml_file' not in form:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No KML file provided'}).encode())
                return
            
            file_item = form['kml_file']
            if not file_item.filename:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No file selected'}).encode())
                return
            
            # Read KML content entirely in memory - NEVER stored to disk
            kml_content = file_item.file.read().decode('utf-8')
            filename = file_item.filename
            kml_poly = parse_kml_polygon(kml_content)
            
            city_data = get_city_data()
            
            total_pop_sum = 0
            all_intersecting_zones = []
            
            # Aggregate data from all loaded cities
            for city_name, data in city_data.items():
                try:
                    total_pop = calcular_poblacion_interseccion(
                        kml_poly, data['pop_df'], data['geo_df'],
                        join_key_geo=data['config']
                    )
                    total_pop_sum += total_pop
                    
                    stats = get_zone_statistics(
                        kml_poly, data['geo_df'], data['pop_df'],
                        city_config=data['config']
                    )
                    all_intersecting_zones.extend(stats.get('intersecting_zones', []))
                except Exception as e:
                    print(f"Error processing city {city_name}: {e}")
                    continue
            
            # Convert polygon to GeoJSON for map display
            coords = [[float(coord[0]), float(coord[1])] for coord in kml_poly]
            geojson = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coords]
                },
                'properties': {
                    'name': filename
                }
            }
            
            result = {
                'population': round(total_pop_sum),
                'statistics': {
                    'total_population': round(total_pop_sum),
                    'intersecting_zones': all_intersecting_zones,
                    'num_zones': len(all_intersecting_zones)
                },
                'geojson': geojson
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"Error in calculate-population: {error_trace}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
