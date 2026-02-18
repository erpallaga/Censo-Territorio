// Initialize map centered on Barcelona
const map = L.map('map').setView([41.3851, 2.1734], 12);

// Create custom panes for layer ordering
if (!map.getPane('kmlPane')) {
    map.createPane('kmlPane');
    map.getPane('kmlPane').style.zIndex = 650; // Above censusPane (500)
}
if (!map.getPane('censusPane')) {
    map.createPane('censusPane');
    map.getPane('censusPane').style.zIndex = 500; // Above KML pane
}

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Global state
let censusZonesLayer = null;
let uploadedZoneLayer = null;
let currentCity = 'barcelona';
const cities = ['barcelona', 'l_hospitalet'];

// Visualization mode: 'density' or 'population'
let currentMode = 'density';

// Density state
let densityMax = 0;
let densityMin = Infinity;
let visibleDensities = new Set();
let densityThresholds = [];

// Population state
let populationMax = 0;
let populationMin = Infinity;
let visiblePopulations = new Set();
let populationThresholds = [];

// ── Color palettes ──────────────────────────────────────────────
const densityColors = ['#006837', '#238b45', '#74c476', '#fed976', '#fd8d3c', '#e31a1c', '#99000d'];
const populationColors = ['#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'];

function getDensityColor(density) {
    if (densityThresholds.length === 0) return densityColors[0];
    if (density < densityThresholds[0]) return densityColors[0];
    if (density < densityThresholds[1]) return densityColors[1];
    if (density < densityThresholds[2]) return densityColors[2];
    if (density < densityThresholds[3]) return densityColors[3];
    if (density < densityThresholds[4]) return densityColors[4];
    if (density < densityThresholds[5]) return densityColors[5];
    return densityColors[6];
}

function getPopulationColor(population) {
    if (populationThresholds.length === 0) return populationColors[0];
    if (population < populationThresholds[0]) return populationColors[0];
    if (population < populationThresholds[1]) return populationColors[1];
    if (population < populationThresholds[2]) return populationColors[2];
    if (population < populationThresholds[3]) return populationColors[3];
    if (population < populationThresholds[4]) return populationColors[4];
    if (population < populationThresholds[5]) return populationColors[5];
    return populationColors[6];
}

// Generic: get color for a feature based on current mode
function getFeatureColor(feature) {
    if (currentMode === 'population') {
        return getPopulationColor(feature.properties.population || 0);
    }
    return getDensityColor(feature.properties.density || 0);
}

// ── Quantiles ────────────────────────────────────────────────────
function getQuantiles(data, numBuckets) {
    if (data.length === 0) return [];
    const sorted = [...data].sort((a, b) => a - b);
    const quantiles = [];
    for (let i = 1; i < numBuckets; i++) {
        const index = (i / numBuckets) * (sorted.length - 1);
        const low = Math.floor(index);
        const high = Math.ceil(index);
        const weight = index - low;
        quantiles.push(sorted[low] * (1 - weight) + sorted[high] * weight);
    }
    return quantiles;
}

// ── Apply visualization (re-color all visible layers) ────────────
function applyVisualization() {
    if (!censusZonesLayer) return;
    censusZonesLayer.eachLayer(layer => {
        // Only re-color visible layers (opacity > 0)
        if (layer.options && layer.options.fillOpacity === 0) return;
        const color = getFeatureColor(layer.feature);
        layer.setStyle({ fillColor: color });
    });
}

// ── Legend ────────────────────────────────────────────────────────
function updateLegend() {
    const legendContent = document.getElementById('legend-content');

    const isDensity = currentMode === 'density';
    const colors = isDensity ? densityColors : populationColors;
    const thresholds = isDensity ? densityThresholds : populationThresholds;
    const minVal = isDensity ? densityMin : populationMin;
    const maxVal = isDensity ? densityMax : populationMax;
    const unit = isDensity ? 'hab/km²' : 'hab';
    const basedOn = isDensity ? 'densidad poblacional' : 'población absoluta';

    if (maxVal === 0 || minVal === Infinity || thresholds.length === 0) {
        legendContent.innerHTML = '<p style="font-size: 0.9em; color: #666; font-style: italic;">Cargando...</p>';
        return;
    }

    let legendHTML = '<div style="margin-bottom: 8px;">';

    if (maxVal === minVal) {
        const color = isDensity ? getDensityColor(maxVal) : getPopulationColor(maxVal);
        legendHTML += `
            <div class="legend-item" style="margin-bottom: 6px;">
                <div class="legend-color" style="background: ${color};"></div>
                <span style="font-size: 0.85em;">${Math.round(maxVal).toLocaleString()} ${unit}</span>
            </div>
        `;
    } else {
        const fullThresholds = [minVal, ...thresholds, maxVal];
        for (let i = 0; i < colors.length; i++) {
            const lo = fullThresholds[i];
            const hi = fullThresholds[i + 1];
            legendHTML += `
                <div class="legend-item" style="margin-bottom: 6px;">
                    <div class="legend-color" style="background: ${colors[i]};"></div>
                    <span style="font-size: 0.85em;">${Math.round(lo).toLocaleString()} - ${Math.round(hi).toLocaleString()} ${unit}</span>
                </div>
            `;
        }
    }

    legendHTML += '</div>';
    legendHTML += `<p style="margin-top: 10px; font-size: 0.85em; color: #666;">Basado en ${basedOn}</p>`;
    legendContent.innerHTML = legendHTML;
}

// ── Compute stats from a set of features ─────────────────────────
function computeStatsFromFeatures(features) {
    densityMax = 0; densityMin = Infinity;
    populationMax = 0; populationMin = Infinity;
    visibleDensities.clear();
    visiblePopulations.clear();

    features.forEach(feature => {
        const density = feature.properties.density || 0;
        const population = feature.properties.population || 0;
        if (density > 0) {
            visibleDensities.add(density);
            if (density > densityMax) densityMax = density;
            if (density < densityMin) densityMin = density;
        }
        if (population > 0) {
            visiblePopulations.add(population);
            if (population > populationMax) populationMax = population;
            if (population < populationMin) populationMin = population;
        }
    });

    densityThresholds = getQuantiles(Array.from(visibleDensities), 7);
    populationThresholds = getQuantiles(Array.from(visiblePopulations), 7);
}

// ── Load census zones ────────────────────────────────────────────
async function loadCensusZones() {
    const mapSpinner = document.getElementById('map-spinner');
    try {
        if (censusZonesLayer) map.removeLayer(censusZonesLayer);
        if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);

        updateLegend();
        if (mapSpinner) mapSpinner.classList.add('show');

        // Load census zones for all cities in parallel
        const fetchPromises = cities.map(city =>
            fetch(`/api/census-zones?city=${city}`).then(r => r.json())
        );

        const results = await Promise.all(fetchPromises);

        // Merge GeoJSON features
        const combinedGeojson = {
            type: 'FeatureCollection',
            features: []
        };

        results.forEach(geojson => {
            if (geojson.features) {
                combinedGeojson.features.push(...geojson.features);
            }
        });

        // Compute density + population stats
        computeStatsFromFeatures(combinedGeojson.features);
        updateLegend();

        censusZonesLayer = L.geoJSON(combinedGeojson, {
            pane: 'censusPane',
            style: function (feature) {
                const color = getFeatureColor(feature);
                return { color: '#333', weight: 1, fillColor: color, fillOpacity: 0.6 };
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const isLH = props.join_key && !isNaN(props.join_key) && parseInt(props.join_key) < 1000;

                let popupContent = "";
                if (props.district && props.district !== "Barris") {
                    popupContent += `<strong>${props.district}</strong><br>`;
                }

                const neighborhoodLabel = (props.district === "Barris" || isLH) ? `<strong>${props.neighborhood}</strong>` : props.neighborhood;
                popupContent += `${neighborhoodLabel}<br>`;

                popupContent += `Población: <strong>${props.population.toLocaleString()}</strong><br>
                                Área: ${(props.area_km2 || 0).toFixed(2)} km²<br>
                                Densidad: <strong>${(props.density || 0).toLocaleString()} hab/km²</strong>`;

                layer.bindPopup(popupContent);
            }
        }).addTo(map);

        // Zoom to fit all zones
        map.fitBounds(censusZonesLayer.getBounds());
    } catch (error) {
        console.error('Error loading census zones:', error);
        alert('Error al cargar las zonas censales');
    } finally {
        if (mapSpinner) mapSpinner.classList.remove('show');
    }
}

// ── Toggle event listeners ───────────────────────────────────────
document.querySelectorAll('.legend-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.mode === currentMode) return;
        // Update active class
        document.querySelectorAll('.legend-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Switch mode
        currentMode = btn.dataset.mode;
        updateLegend();
        applyVisualization();
    });
});

// ── Handle form submission ───────────────────────────────────────
document.getElementById('upload-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);

    const loading = document.getElementById('loading');
    const statsPanel = document.getElementById('stats-panel');
    const calculateBtn = document.getElementById('calculate-btn');

    loading.classList.add('show');
    statsPanel.classList.remove('show');
    calculateBtn.disabled = true;

    try {
        const response = await fetch('/api/calculate-population', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('total-population').textContent = data.population.toLocaleString();
            statsPanel.classList.add('show');

            if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);
            uploadedZoneLayer = L.geoJSON(data.geojson, {
                pane: 'kmlPane',
                style: {
                    color: '#2D3436',
                    weight: 6,
                    opacity: 1,
                    dashArray: '10, 10',
                    fillColor: '#2D3436',
                    fillOpacity: 0.1
                }
            }).addTo(map);

            if (censusZonesLayer) {
                const intersectingKeys = new Set();
                if (data.statistics && data.statistics.intersecting_zones) {
                    data.statistics.intersecting_zones.forEach(zone => intersectingKeys.add(zone.join_key));
                }

                // Collect visible features for stats recalculation
                const visibleFeatures = [];
                censusZonesLayer.eachLayer(layer => {
                    const key = layer.feature.properties.join_key;
                    if (intersectingKeys.has(key)) {
                        visibleFeatures.push(layer.feature);
                        layer.setStyle({ fillOpacity: 0.6, opacity: 1 });
                    } else {
                        layer.setStyle({ fillOpacity: 0, opacity: 0 });
                    }
                });

                // Recalculate stats for visible zones only
                computeStatsFromFeatures(visibleFeatures);

                // Re-color visible zones based on current mode
                censusZonesLayer.eachLayer(layer => {
                    if (intersectingKeys.has(layer.feature.properties.join_key)) {
                        const color = getFeatureColor(layer.feature);
                        layer.setStyle({ fillColor: color });
                    }
                });

                updateLegend();
                censusZonesLayer.bringToFront();
            }
            map.fitBounds(uploadedZoneLayer.getBounds(), { padding: [50, 50] });
        } else alert('Error: ' + data.error);
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar el archivo KML');
    } finally {
        loading.classList.remove('show');
        calculateBtn.disabled = false;
    }
});

// ── Reset view button ────────────────────────────────────────────
document.getElementById('reset-view-btn').addEventListener('click', () => {
    if (censusZonesLayer) {
        // Collect all features for stats recalculation
        const allFeatures = [];
        censusZonesLayer.eachLayer(l => {
            allFeatures.push(l.feature);
        });

        computeStatsFromFeatures(allFeatures);

        censusZonesLayer.eachLayer(layer => {
            const color = getFeatureColor(layer.feature);
            layer.setStyle({ fillColor: color, fillOpacity: 0.6, opacity: 1 });
        });
        updateLegend();
        map.fitBounds(censusZonesLayer.getBounds());
    }
});

// Initial load
loadCensusZones();
