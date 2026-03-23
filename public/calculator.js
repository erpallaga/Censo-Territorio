// census calculator — client-side port of api/_shared/census_calculator.py
// All geometry is already in GeoJSON (no WKT parsing needed).

// Point-in-polygon via ray casting (same algorithm as Python version)
function pointInPolygon(x, y, polygon) {
    let inside = false;
    const n = polygon.length;
    let p1 = polygon[0];
    for (let i = 1; i <= n; i++) {
        const p2 = polygon[i % n];
        const p1x = p1[0], p1y = p1[1], p2x = p2[0], p2y = p2[1];
        if (y > Math.min(p1y, p2y) && y <= Math.max(p1y, p2y) && x <= Math.max(p1x, p2x)) {
            if (p1y !== p2y) {
                const xi = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
                if (p1x === p2x || x <= xi) inside = !inside;
            }
        }
        p1 = p2;
    }
    return inside;
}

// Parse <coordinates> from KML text → [[lon, lat], ...]
function parseKMLPolygon(kmlText) {
    const match = kmlText.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    if (!match) throw new Error('No se encontró <coordinates> en el KML');
    const coords = match[1].trim().split(/\s+/).map(c => {
        const p = c.split(',');
        return [parseFloat(p[0]), parseFloat(p[1])];
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
    if (coords.length < 3) throw new Error('El polígono necesita al menos 3 puntos');
    return coords;
}

// Monte Carlo population estimation
// kmlCoords: [[lon,lat], ...]  from parseKMLPolygon
// features:  GeoJSON Feature array (from the pre-loaded census layer)
// Returns:   { population, intersecting_zones, geojson }
function calculatePopulationFromKML(kmlCoords, features) {
    const kmlMinX = Math.min(...kmlCoords.map(c => c[0]));
    const kmlMaxX = Math.max(...kmlCoords.map(c => c[0]));
    const kmlMinY = Math.min(...kmlCoords.map(c => c[1]));
    const kmlMaxY = Math.max(...kmlCoords.map(c => c[1]));

    // Pass 1 — bbox + quick 100-point check
    const candidates = [];
    for (const feature of features) {
        const poly = feature.geometry.coordinates[0];
        const zMinX = Math.min(...poly.map(c => c[0]));
        const zMaxX = Math.max(...poly.map(c => c[0]));
        const zMinY = Math.min(...poly.map(c => c[1]));
        const zMaxY = Math.max(...poly.map(c => c[1]));

        if (zMaxX < kmlMinX || zMinX > kmlMaxX || zMaxY < kmlMinY || zMinY > kmlMaxY) continue;

        const oMinX = Math.max(zMinX, kmlMinX), oMaxX = Math.min(zMaxX, kmlMaxX);
        const oMinY = Math.max(zMinY, kmlMinY), oMaxY = Math.min(zMaxY, kmlMaxY);
        let inZone = 0, inBoth = 0;
        for (let i = 0; i < 100; i++) {
            const x = oMinX + Math.random() * (oMaxX - oMinX);
            const y = oMinY + Math.random() * (oMaxY - oMinY);
            if (pointInPolygon(x, y, poly)) {
                inZone++;
                if (pointInPolygon(x, y, kmlCoords)) inBoth++;
            }
        }
        if (inZone > 0 && inBoth / inZone >= 0.10) {
            candidates.push({ feature, poly, bbox: [zMinX, zMinY, zMaxX, zMaxY] });
        }
    }

    const numZones = candidates.length;
    if (numZones === 0) {
        return { population: 0, intersecting_zones: [], geojson: buildKMLGeoJSON(kmlCoords) };
    }

    // Pass 2 — full Monte Carlo
    const nPts = numZones <= 10 ? 10000 : numZones <= 50 ? 5000 : 1000;
    let totalPop = 0;
    const intersectingZones = [];

    for (const { feature, poly, bbox: [zMinX, zMinY, zMaxX, zMaxY] } of candidates) {
        let inZone = 0, inBoth = 0;
        for (let i = 0; i < nPts; i++) {
            const x = zMinX + Math.random() * (zMaxX - zMinX);
            const y = zMinY + Math.random() * (zMaxY - zMinY);
            if (pointInPolygon(x, y, poly)) {
                inZone++;
                if (pointInPolygon(x, y, kmlCoords)) inBoth++;
            }
        }
        if (inZone === 0) continue;
        const ratio = inBoth / inZone;
        if (ratio >= 0.10) {
            const p = feature.properties;
            totalPop += p.population * ratio;
            intersectingZones.push({
                join_key: p.join_key,
                district: p.district,
                neighborhood: p.neighborhood,
                population: p.population
            });
        }
    }

    return {
        population: Math.round(totalPop),
        intersecting_zones: intersectingZones,
        geojson: buildKMLGeoJSON(kmlCoords)
    };
}

function buildKMLGeoJSON(kmlCoords) {
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [kmlCoords] },
            properties: {}
        }]
    };
}
