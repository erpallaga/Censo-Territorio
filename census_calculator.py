import numpy as np
import pandas as pd
import xml.etree.ElementTree as ET
import re

# 1. Función point-in-polygon (ray casting)
def point_in_polygon(x, y, poly):
    """Check if a point (x, y) is inside a polygon using ray casting algorithm"""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# 2. Parsear el KML (coordenadas del polígono de interés)
def parse_kml_polygon(kml_content):
    """Parse KML content and extract polygon coordinates. Handles namespaces and multiple possible structures."""
    try:
        # Simple regex approach to find coordinates as ET.fromstring is strict with namespaces
        # This is more robust against different KML versions and namespaces
        match = re.search(r'<coordinates>(.*?)</coordinates>', kml_content, re.DOTALL)
        if not match:
            # Try with namespace if regex fails or if there are multiple
            try:
                root = ET.fromstring(kml_content)
                # Find all coordinates tags regardless of namespace
                coords_elements = root.findall('.//{*}coordinates')
                if not coords_elements:
                    raise ValueError("No se encontró la etiqueta <coordinates> en el archivo KML")
                coords_text = coords_elements[0].text
            except Exception:
                raise ValueError("No se pudo encontrar ninguna geometría válida en el archivo KML")
        else:
            coords_text = match.group(1)

        if not coords_text or not coords_text.strip():
            raise ValueError("La etiqueta <coordinates> está vacía")

        coords = []
        for coord in coords_text.strip().split():
            # Handle both lon,lat and lon,lat,alt
            parts = coord.split(',')
            if len(parts) >= 2:
                lon, lat = map(float, parts[:2])
                coords.append((lon, lat))
        
        if len(coords) < 3:
            raise ValueError(f"Se encontraron solo {len(coords)} puntos. Un polígono necesita al menos 3.")
            
        return np.array(coords)
    except Exception as e:
        print(f"Error parsing KML: {e}")
        raise ValueError(f"Error al procesar el archivo KML: {str(e)}")

# 3. Parsear WKT de geometría WGS84 (soporta POLYGON y MULTIPOLYGON)
def parse_wkt_polygon(wkt):
    """Parse WKT polygon string and extract coordinates (handles POLYGON and MULTIPOLYGON)"""
    if not wkt or pd.isna(wkt):
        return None
    
    # Handle MULTIPOLYGON - extract the first polygon
    if wkt.startswith('MULTIPOLYGON'):
        # Extract the first polygon from MULTIPOLYGON
        match = re.search(r'MULTIPOLYGON\s*\(\s*\(\((.*?)\)\)', wkt, re.DOTALL)
        if not match:
            return None
        coords_str = match.group(1).strip()
    # Handle POLYGON
    elif wkt.startswith('POLYGON'):
        match = re.search(r'POLYGON\s*\(\((.*?)\)\)', wkt, re.DOTALL)
        if not match:
            return None
        coords_str = match.group(1).strip()
    else:
        return None
    
    coords = []
    for part in coords_str.split(','):
        part = part.strip()
        if part:
            # Remove any opening parentheses at the start
            part = part.lstrip('(').strip()
            try:
                lon, lat = map(float, part.split())
                coords.append((lon, lat))
            except (ValueError, IndexError):
                # Skip malformed coordinate pairs
                continue
    
    if len(coords) < 3:  # Need at least 3 points for a polygon
        return None
    
    return np.array(coords)

# 3b. Calculate polygon area in square kilometers (using spherical approximation)
def calculate_polygon_area(coords):
    """
    Calculate the area of a polygon in square kilometers using spherical geometry.
    Uses a method that accounts for the Earth's curvature.
    """
    if len(coords) < 3:
        return 0.0
    
    # Earth radius in kilometers
    R = 6371.0
    
    # Close the polygon if needed
    if not np.array_equal(coords[0], coords[-1]):
        coords_closed = np.vstack([coords, coords[0]])
    else:
        coords_closed = coords
    
    # Convert to radians
    lons = np.radians(coords_closed[:, 0])
    lats = np.radians(coords_closed[:, 1])
    
    n = len(coords_closed) - 1
    area = 0.0
    
    for i in range(n):
        area += (lons[i + 1] - lons[i]) * (2 + np.sin(lats[i]) + np.sin(lats[i + 1]))
    
    area = abs(area * R * R / 2.0)
    
    return area

# 4. Calcular población en intersección
def calcular_poblacion_interseccion(kml_poly, pad_df, secc_df, n_points=None):
    """
    Calculate population in the intersection of KML polygon with census zones
    using dynamic Monte Carlo sampling based on the number of affected zones.
    """
    # Get bbox of KML polygon for filtering
    min_lon, min_lat = kml_poly.min(axis=0)
    max_lon, max_lat = kml_poly.max(axis=0)
    
    # Pass 1: Find truly intersecting zones and collect their data
    intersecting_data = []
    
    for _, row in secc_df.iterrows():
        wkt = row['geometria_wgs84']
        secc_poly = parse_wkt_polygon(wkt)
        if secc_poly is None:
            continue
        
        # Bbox of the census section
        s_min_lon, s_min_lat = secc_poly.min(axis=0)
        s_max_lon, s_max_lat = secc_poly.max(axis=0)
        
        # Check bbox overlap (fast filter)
        if (s_max_lon < min_lon or s_min_lon > max_lon or
            s_max_lat < min_lat or s_min_lat > max_lat):
            continue
        
        # Quick check if truly intersects (using 100 points for reliability)
        n_quick = 100
        x_rand = np.random.uniform(max(s_min_lon, min_lon), min(s_max_lon, max_lon), n_quick)
        y_rand = np.random.uniform(max(s_min_lat, min_lat), min(s_max_lat, max_lat), n_quick)
        
        # Check if any point is in both polygons
        in_seccion = [point_in_polygon(x, y, secc_poly) for x, y in zip(x_rand, y_rand)]
        in_both = any(point_in_polygon(x, y, kml_poly) for i, (x, y) in enumerate(zip(x_rand, y_rand)) if in_seccion[i])
        
        if in_both:
            seccion_key = f"{int(row['codi_districte']):02d}{int(row['codi_seccio_censal']):03d}"
            pop_row = pad_df[pad_df['Seccio_Censal'] == int(seccion_key)]
            if not pop_row.empty:
                intersecting_data.append({
                    'secc_poly': secc_poly,
                    'population': pop_row['Valor'].values[0],
                    'bbox': (s_min_lon, s_min_lat, s_max_lon, s_max_lat)
                })
    
    num_zones = len(intersecting_data)
    if num_zones == 0:
        return 0
    
    # Determine n_points dynamically if not explicitly provided
    if n_points is None:
        if num_zones <= 10:
            target_n_points = 10000
        elif num_zones <= 50:
            target_n_points = 5000
        else:
            target_n_points = 1000
    else:
        target_n_points = n_points

    print(f"Intersects with {num_zones} zones. Using {target_n_points} Monte Carlo points.")
    
    # Pass 2: Precise Monte Carlo calculation for identified zones
    total_pop = 0.0
    for data in intersecting_data:
        secc_poly = data['secc_poly']
        poblacion = data['population']
        s_min_lon, s_min_lat, s_max_lon, s_max_lat = data['bbox']
        
        # Generate random points in the sector's bbox
        x_rand = np.random.uniform(s_min_lon, s_max_lon, target_n_points)
        y_rand = np.random.uniform(s_min_lat, s_max_lat, target_n_points)
        
        # Count points in section
        in_seccion_mask = np.array([point_in_polygon(x, y, secc_poly) for x, y in zip(x_rand, y_rand)])
        n_in_seccion = np.sum(in_seccion_mask)
        
        if n_in_seccion == 0:
            continue
            
        # Count points from those that are also in KML polygon
        x_in_secc = x_rand[in_seccion_mask]
        y_in_secc = y_rand[in_seccion_mask]
        
        in_kml_count = sum(1 for x, y in zip(x_in_secc, y_in_secc) if point_in_polygon(x, y, kml_poly))
        
        ratio = in_kml_count / n_in_seccion
        total_pop += poblacion * ratio
    
    return round(total_pop)

# 5. Convert census zones to GeoJSON for map display
def get_census_zones_geojson(secc_df, pad_df, sample_size=None):
    """Convert census zones to GeoJSON format for map visualization"""
    features = []
    
    # Sample if specified, otherwise use all zones
    if sample_size and sample_size < len(secc_df):
        df = secc_df.sample(min(sample_size, len(secc_df)), random_state=42)
    else:
        df = secc_df
    
    for idx, row in df.iterrows():
        try:
            wkt = row['geometria_wgs84']
            if pd.isna(wkt) or not wkt:
                continue
                
            poly = parse_wkt_polygon(wkt)
            if poly is None or len(poly) == 0:
                continue
            
            # Calculate area in square kilometers
            area_km2 = calculate_polygon_area(poly)
            
            # Get population - handle both string and int codes
            dist_code = int(row['codi_districte'])
            sect_code = int(row['codi_seccio_censal'])
            seccion_key = f"{dist_code:02d}{sect_code:03d}"
            pop_row = pad_df[pad_df['Seccio_Censal'] == int(seccion_key)]
            population = int(pop_row['Valor'].values[0]) if not pop_row.empty else 0
            
            # Calculate density (people per square kilometer)
            density = float(population / area_km2 if area_km2 > 0 else 0)
            area_km2 = float(area_km2)
            
            coords = [[float(coord[0]), float(coord[1])] for coord in poly]
            
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coords]
                },
                'properties': {
                    'district': str(row['nom_districte']),
                    'neighborhood': str(row['nom_barri']),
                    'district_code': int(dist_code),
                    'section_code': int(sect_code),
                    'population': int(population),
                    'area_km2': round(area_km2, 4),
                    'density': round(density, 2)
                }
            })
        except Exception as e:
            # Skip problematic rows but continue processing
            print(f"Warning: Skipping row {idx}: {e}")
            continue
    
    return {
        'type': 'FeatureCollection',
        'features': features
    }

# 6. Get zone statistics
def get_zone_statistics(kml_poly, secc_df, pad_df, n_points=None):
    """Get detailed statistics for a zone - only includes zones that actually intersect"""
    # Get bbox of KML polygon
    min_lon, min_lat = kml_poly.min(axis=0)
    max_lon, max_lat = kml_poly.max(axis=0)
    
    intersecting_zones = []
    total_pop = 0.0
    
    # Use same logic as calcular_poblacion_interseccion to find truly intersecting zones
    for _, row in secc_df.iterrows():
        wkt = row['geometria_wgs84']
        secc_poly = parse_wkt_polygon(wkt)
        if secc_poly is None:
            continue
        
        # Bbox of the section
        s_min_lon, s_min_lat = secc_poly.min(axis=0)
        s_max_lon, s_max_lat = secc_poly.max(axis=0)
        
        # If no bbox overlap, skip
        if (s_max_lon < min_lon or s_min_lon > max_lon or
            s_max_lat < min_lat or s_min_lat > max_lat):
            continue
        
        seccion_key = f"{int(row['codi_districte']):02d}{int(row['codi_seccio_censal']):03d}"
        pop_row = pad_df[pad_df['Seccio_Censal'] == int(seccion_key)]
        if pop_row.empty:
            continue
        
        poblacion = pop_row['Valor'].values[0]
        
        # Quick check with Monte Carlo to see if they actually intersect
        # Use fewer points for speed, but enough to detect intersection
        calc_n_points = n_points if n_points is not None else 10000
        n_quick = min(calc_n_points // 10, 1000)  # Use 10% of points or max 1000
        x_rand = np.random.uniform(max(s_min_lon, min_lon), min(s_max_lon, max_lon), n_quick)
        y_rand = np.random.uniform(max(s_min_lat, min_lat), min(s_max_lat, max_lat), n_quick)
        
        in_seccion = np.array([
            point_in_polygon(x, y, secc_poly) for x, y in zip(x_rand, y_rand)
        ])
        n_in_seccion = np.sum(in_seccion)
        if n_in_seccion == 0:
            continue
        
        # Check if any of those points are in the KML polygon
        in_kml = np.array([
            point_in_polygon(x, y, kml_poly) for x, y in zip(x_rand[in_seccion], y_rand[in_seccion])
        ])
        n_in_interseccion = np.sum(in_kml)
        
        # Only include zones that actually intersect (have points in intersection)
        if n_in_interseccion > 0:
            intersecting_zones.append({
                'district': row['nom_districte'],
                'neighborhood': row['nom_barri'],
                'district_code': int(row['codi_districte']),
                'section_code': int(row['codi_seccio_censal']),
                'population': int(poblacion)
            })
    
    # Calculate total population using the full calculation
    total_pop = calcular_poblacion_interseccion(kml_poly, pad_df, secc_df, n_points=n_points)
    
    return {
        'total_population': total_pop,
        'intersecting_zones': intersecting_zones,  # Now only truly intersecting zones
        'num_zones': len(intersecting_zones)
    }

