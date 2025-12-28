from flask import Flask, render_template, request, jsonify
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

# Load data once at startup
try:
    PAD_DF = pd.read_csv('2025_pad_mdbas.csv')
    SECC_DF = pd.read_csv('BarcelonaCiutat_SeccionsCensals.csv')
    print(f"Loaded {len(PAD_DF)} population records and {len(SECC_DF)} census zones")
except Exception as e:
    print(f"Error loading CSV files: {e}")
    raise

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/census-zones', methods=['GET'])
def get_census_zones():
    """Get all census zones as GeoJSON for map display"""
    try:
        # Sample zones for performance (can be adjusted)
        sample_size = request.args.get('sample', type=int)
        geojson = get_census_zones_geojson(SECC_DF, PAD_DF, sample_size=sample_size)
        return jsonify(geojson)
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error in get_census_zones: {error_trace}")
        return jsonify({'error': str(e), 'traceback': error_trace}), 500

@app.route('/api/calculate-population', methods=['POST'])
def calculate_population():
    """Calculate population for uploaded KML polygon"""
    try:
        if 'kml_file' not in request.files:
            return jsonify({'error': 'No KML file provided'}), 400
        
        file = request.files['kml_file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        n_points = int(request.form.get('n_points', 1000))
        
        # Read KML content
        kml_content = file.read().decode('utf-8')
        kml_poly = parse_kml_polygon(kml_content)
        
        # Calculate population using dynamic sampling
        total_pop = calcular_poblacion_interseccion(
            kml_poly, PAD_DF, SECC_DF
        )
        
        # Get statistics (will also use dynamic sampling internally)
        stats = get_zone_statistics(kml_poly, SECC_DF, PAD_DF)
        
        # Convert polygon to GeoJSON for map display
        coords = [[float(coord[0]), float(coord[1])] for coord in kml_poly]
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
            'population': total_pop,
            'statistics': stats,
            'geojson': geojson
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zone-stats/<int:district>/<int:section>', methods=['GET'])
def get_zone_detail(district, section):
    """Get detailed statistics for a specific census zone"""
    try:
        seccion_key = f"{district:02d}{section:03d}"
        pop_row = PAD_DF[PAD_DF['Seccio_Censal'] == int(seccion_key)]
        
        if pop_row.empty:
            return jsonify({'error': 'Zone not found'}), 404
        
        row = pop_row.iloc[0]
        
        # Get geometry
        secc_row = SECC_DF[
            (SECC_DF['codi_districte'] == f"{district:02d}") &
            (SECC_DF['codi_seccio_censal'] == f"{section:03d}")
        ]
        
        if secc_row.empty:
            return jsonify({'error': 'Zone geometry not found'}), 404
        
        wkt = secc_row.iloc[0]['geometria_wgs84']
        poly = parse_wkt_polygon(wkt)
        coords = [[float(coord[0]), float(coord[1])] for coord in poly]
        
        return jsonify({
            'population': int(row['Valor']),
            'district': row['Nom_Districte'],
            'neighborhood': row['Nom_Barri'],
            'district_code': district,
            'section_code': section,
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

