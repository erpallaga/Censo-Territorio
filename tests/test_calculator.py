import pytest
import numpy as np
from census_calculator import point_in_polygon, calculate_polygon_area, parse_wkt_polygon

def test_point_in_polygon():
    """Test point in polygon algorithm"""
    # Square 0,0 to 10,10. Vertices: (0,0), (10,0), (10,10), (0,10)
    # The function expects list of tuples or numpy array
    poly = [(0,0), (10,0), (10,10), (0,10)]
    
    # Inside
    assert point_in_polygon(5, 5, poly) == True
    # Outside
    assert point_in_polygon(11, 5, poly) == False
    assert point_in_polygon(5, 11, poly) == False
    assert point_in_polygon(-1, 5, poly) == False
    
    # On edge/vertex (algorithm behavior depends on exact implementation)
    # Usually standard ray casting might vary on edges, but let's test obvious inside/outside
    
    # Testing with numpy array
    poly_np = np.array(poly)
    assert point_in_polygon(5, 5, poly_np) == True

def test_calculate_polygon_area():
    """Test spherical area calculation"""
    # Simple small square at equator: (0,0), (0,1), (1,1), (1,0)
    # 1 degree is approx 111.32 km.
    # Area should be roughly 111.32 * 111.32 = ~12392 km2
    
    coords = np.array([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])
    area = calculate_polygon_area(coords)
    
    # Check it's reasonable (between 12000 and 12500)
    assert 12000 < area < 12500
    
    # Test tiny area (Barcelona scale)
    # 0.01 degree approx 1.1km
    # 0.01 x 0.01 deg sq -> ~1.2 km2
    coords_small = np.array([(2.1, 41.3), (2.11, 41.3), (2.11, 41.31), (2.1, 41.31)])
    area_small = calculate_polygon_area(coords_small)
    assert area_small > 0
    assert area_small < 10 # Should be around 1.2
    
def test_parse_wkt():
    """Test WKT parsing"""
    # Simple Polygon
    wkt = "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"
    poly = parse_wkt_polygon(wkt)
    assert poly is not None
    assert len(poly) == 5
    assert np.allclose(poly[0], [0, 0])
    assert np.allclose(poly[2], [10, 10])
    
    # Multipolygon (should extract first one)
    wkt_multi = "MULTIPOLYGON (((0 0, 5 0, 5 5, 0 5, 0 0)))"
    poly_multi = parse_wkt_polygon(wkt_multi)
    assert poly_multi is not None
    assert len(poly_multi) == 5
    assert np.allclose(poly_multi[2], [5, 5])
    
    # Invalid
    assert parse_wkt_polygon("INVALID") is None
    assert parse_wkt_polygon("") is None
