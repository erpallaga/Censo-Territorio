import os
import pandas as pd

# Module-level cache for warm invocations
_CITY_DATA = {}
_DATA_LOADED = False

# Config for each city
CITY_CONFIGS = {
    'barcelona': {
        'pop_file': 'data/2025_pad_mdbas.csv',
        'geo_file': 'data/BarcelonaCiutat_SeccionsCensals.csv',
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
        'pop_file': "data/L'Hospitalet/06ff0a2d-f6f8-4bf5-9ac1-ed09fda42a8b.csv",
        'geo_file': "data/L'Hospitalet/TERRITORI_DIVISIONS_BAR.csv",
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


def _get_project_root():
    """Get the project root directory."""
    # Check if data directory exists in current working directory (Vercel lambda root)
    if os.path.exists(os.path.join(os.getcwd(), 'data')):
        return os.getcwd()
        
    # Fallback to local development text relative to this file
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_city_data():
    """Load and cache city data. Returns the CITY_DATA dict."""
    global _CITY_DATA, _DATA_LOADED
    
    if _DATA_LOADED:
        return _CITY_DATA
    
    root = _get_project_root()
    
    for city, config in CITY_CONFIGS.items():
        try:
            geo_path = os.path.join(root, config['geo_file'])
            pop_path = os.path.join(root, config['pop_file'])
            
            encoding = 'latin1' if config['geo_sep'] == '|' else 'utf-8'
            geo_df = pd.read_csv(geo_path, sep=config['geo_sep'], encoding=encoding)
            pop_df = pd.read_csv(pop_path)
            
            # Post-processing
            if city == 'barcelona':
                if 'seccion_key' not in geo_df.columns:
                    geo_df['seccion_key'] = geo_df.apply(
                        lambda r: int(f"{int(r['codi_districte']):02d}{int(r['codi_seccio_censal']):03d}"),
                        axis=1
                    )
            elif city == 'l_hospitalet':
                # Map Granvia Sud (geometry 16 -> population 13)
                geo_df.loc[geo_df['CodiElement'] == 16, 'CodiElement'] = 13
                # LH population needs aggregation for 2025
                pop_df = pop_df[pop_df['AnyPadro'] == 2025]
                pop_df = pop_df.groupby('CodiBarri')['Total'].sum().reset_index()
                pop_df.rename(columns={'Total': 'Valor'}, inplace=True)
            
            _CITY_DATA[city] = {
                'geo_df': geo_df,
                'pop_df': pop_df,
                'config': config
            }
            print(f"Loaded data for {city}")
        except Exception as e:
            print(f"Error loading data for {city}: {e}")
    
    _DATA_LOADED = True
    return _CITY_DATA
