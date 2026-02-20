from flask import Flask, render_template, request, jsonify, Response
import json
import pandas as pd
import numpy as np
import traceback
from census_calculator import (
    point_in_polygon,
    parse_kml_polygon,
    parse_wkt_polygon,
    calcular_poblacion_interseccion,
    get_census_zones_geojson,
    get_zone_statistics
)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Config and Data for cities
CITY_CONFIGS = {
    'barcelona': {
        'pop_file': '2025_pad_mdbas.csv',
        'geo_file': 'BarcelonaCiutat_SeccionsCensals.csv',
        'geo_sep': ',',
        'join_key_geo': 'seccion_key',
        'join_key_pop': 'Seccio_Censal',
        'col_district': 'nom_districte',
        'col_neighborhood': 'nom_barri',
        'col_district_code': 'codi_districte',
        'col_section_code': 'codi_seccio_censal',
        'col_geometry': 'geometria_wgs84'
    },
    'l_hospitalet': {
        'pop_file': "L'Hospitalet/06ff0a2d-f6f8-4bf5-9ac1-ed09fda42a8b.csv",
        'geo_file': "L'Hospitalet/TERRITORI_DIVISIONS_BAR.csv",
        'geo_sep': '|',
        'join_key_geo': 'CodiElement',
        'join_key_pop': 'CodiBarri',
        'col_district': 'NomDivisio',
        'col_neighborhood': 'NomElement',
        'col_district_code': 'CodiDivisio',
        'col_section_code': 'CodiElement',
        'col_geometry': 'Geometria_WGS84_LonLat'
    }
}

CITY_DATA = {}

def load_data():
    """Load data for all cities at startup"""
    for city, config in CITY_CONFIGS.items():
        try:
            geo_df = pd.read_csv(config['geo_file'], sep=config['geo_sep'], encoding='latin1' if config['geo_sep'] == '|' else 'utf-8')
            pop_df = pd.read_csv(config['pop_file'])
            
            # Post-processing
            if city == 'barcelona':
                if 'seccion_key' not in geo_df.columns:
                    geo_df['seccion_key'] = geo_df.apply(lambda r: int(f"{int(r['codi_districte']):02d}{int(r['codi_seccio_censal']):03d}"), axis=1)
            
            elif city == 'l_hospitalet':
                # Map Granvia Sud (geometry 16 -> population 13)
                geo_df.loc[geo_df['CodiElement'] == 16, 'CodiElement'] = 13
                # LH population needs aggregation for 2025
                pop_df = pop_df[pop_df['AnyPadro'] == 2025]
                pop_df = pop_df.groupby('CodiBarri')['Total'].sum().reset_index()
                pop_df.rename(columns={'Total': 'Valor'}, inplace=True)
            
            CITY_DATA[city] = {
                'geo_df': geo_df,
                'pop_df': pop_df,
                'config': config
            }
            print(f"Loaded data for {city}")
        except Exception as e:
            print(f"Error loading data for {city}: {e}")

try:
    load_data()
except Exception as e:
    print(f"Error in data initialization: {e}")
    raise

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/census-zones', methods=['GET'])
def get_census_zones():
    """Get all census zones as GeoJSON for map display"""
    try:
        city = request.args.get('city', 'barcelona')
        if city not in CITY_DATA:
            return jsonify({'error': f'City {city} not found'}), 404
            
        data = CITY_DATA[city]
        sample_size = request.args.get('sample', type=int)
        geojson = get_census_zones_geojson(data['geo_df'], data['pop_df'], sample_size=sample_size, city_config=data['config'])
        
        # Use compact JSON to minimize payload size for Vercel
        return Response(
            json.dumps(geojson, separators=(',', ':')),
            mimetype='application/json'
        )
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error in get_census_zones: {error_trace}")
        return jsonify({'error': str(e), 'traceback': error_trace}), 500

@app.route('/api/calculate-population', methods=['POST'])
def calculate_population():
    """Calculate population for uploaded KML polygon, aggregating all cities"""
    try:
        if 'kml_file' not in request.files:
            return jsonify({'error': 'No KML file provided'}), 400
        
        file = request.files['kml_file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Read KML content once
        kml_content = file.read().decode('utf-8')
        kml_poly = parse_kml_polygon(kml_content)
        
        total_pop_sum = 0
        all_intersecting_zones = []
        
        # Aggregate data from all loaded cities
        for city_name, data in CITY_DATA.items():
            try:
                # Calculate population for this city
                total_pop = calcular_poblacion_interseccion(
                    kml_poly, data['pop_df'], data['geo_df'], 
                    join_key_geo=data['config']
                )
                total_pop_sum += total_pop
                
                # Get statistics for this city
                stats = get_zone_statistics(kml_poly, data['geo_df'], data['pop_df'], city_config=data['config'])
                all_intersecting_zones.extend(stats.get('intersecting_zones', []))
            except Exception as e:
                print(f"Error processing city {city_name} in calculation: {e}")
                continue
        
        # Convert polygon to GeoJSON for map display
        coords = [[round(float(coord[0]), 5), round(float(coord[1]), 5)] for coord in kml_poly]
        geojson = {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coords]
            },
            'properties': {
                'name': file.filename
            }
        }
        
        return jsonify({
            'population': round(total_pop_sum),
            'statistics': {
                'total_population': round(total_pop_sum),
                'intersecting_zones': all_intersecting_zones,
                'num_zones': len(all_intersecting_zones)
            },
            'geojson': geojson
        })
    
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error in calculate_population: {error_trace}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/zone-stats/<city>/<key>', methods=['GET'])
def get_zone_detail(city, key):
    """Get detailed statistics for a specific census zone"""
    try:
        if city not in CITY_DATA:
            return jsonify({'error': f'City {city} not found'}), 404
            
        data = CITY_DATA[city]
        config = data['config']
        
        # Try to match key type (numeric if possible)
        try:
            key_val = int(key)
        except ValueError:
            key_val = key

        pop_row = data['pop_df'][data['pop_df'][config['join_key_pop']] == key_val]
        
        if pop_row.empty:
            return jsonify({'error': 'Zone not found in population data'}), 404
        
        p_row = pop_row.iloc[0]
        
        # Get geometry
        secc_row = data['geo_df'][data['geo_df'][config['join_key_geo']] == key_val]
        
        if secc_row.empty:
            return jsonify({'error': 'Zone geometry not found'}), 404
        
        s_row = secc_row.iloc[0]
        wkt = s_row[config['col_geometry']]
        poly = parse_wkt_polygon(wkt)
        coords = [[round(float(coord[0]), 5), round(float(coord[1]), 5)] for coord in poly]
        
        return jsonify({
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
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)


