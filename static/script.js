// Initialize map centered on Barcelona
const map = L.map('map').setView([41.3851, 2.1734], 12);

// Create custom panes for layer ordering
if (!map.getPane('kmlPane')) {
    map.createPane('kmlPane');
    map.getPane('kmlPane').style.zIndex = 400; // Behind overlay panes
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
let densityMax = 0;
let densityMin = Infinity;
let currentCity = 'barcelona'; // Defaults to barcelona for some calculations if needed, but we aggregate now
const cities = ['barcelona', 'l_hospitalet'];
let visibleDensities = new Set();
let densityThresholds = []; // Store quantile thresholds

// Function to get color based on density and calculated thresholds
function getDensityColor(density) {
    if (densityThresholds.length === 0) return '#006837';
    if (density < densityThresholds[0]) return '#006837'; // Dark green
    if (density < densityThresholds[1]) return '#238b45'; // Medium green
    if (density < densityThresholds[2]) return '#74c476'; // Light green
    if (density < densityThresholds[3]) return '#fed976'; // Yellow
    if (density < densityThresholds[4]) return '#fd8d3c'; // Orange
    if (density < densityThresholds[5]) return '#e31a1c'; // Red-orange
    return '#99000d'; // Dark red
}

// Function to calculate quantiles
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

// Function to update dynamic legend
function updateLegend() {
    const legendContent = document.getElementById('legend-content');
    if (densityMax === 0 || densityMin === Infinity) {
        legendContent.innerHTML = '<p style="font-size: 0.9em; color: #666; font-style: italic;">Cargando...</p>';
        return;
    }

    if (densityMax === 0 || densityMin === Infinity || densityThresholds.length === 0) {
        legendContent.innerHTML = '<p style="font-size: 0.9em; color: #666; font-style: italic;">Cargando...</p>';
        return;
    }

    let legendHTML = '<div style="margin-bottom: 8px;">';

    if (densityMax === densityMin) {
        const color = getDensityColor(densityMax);
        legendHTML += `
            <div class="legend-item" style="margin-bottom: 6px;">
                <div class="legend-color" style="background: ${color};"></div>
                <span style="font-size: 0.85em;">${Math.round(densityMax).toLocaleString()} hab/km²</span>
            </div>
        `;
    } else {
        const colors = ['#006837', '#238b45', '#74c476', '#fed976', '#fd8d3c', '#e31a1c', '#99000d'];
        const fullThresholds = [densityMin, ...densityThresholds, densityMax];

        for (let i = 0; i < colors.length; i++) {
            const minD = fullThresholds[i];
            const maxD = fullThresholds[i + 1];
            legendHTML += `
                <div class="legend-item" style="margin-bottom: 6px;">
                    <div class="legend-color" style="background: ${colors[i]};"></div>
                    <span style="font-size: 0.85em;">${Math.round(minD).toLocaleString()} - ${Math.round(maxD).toLocaleString()} hab/km²</span>
                </div>
            `;
        }
    }

    legendHTML += '</div>';
    legendHTML += '<p style="margin-top: 10px; font-size: 0.85em; color: #666;">Basado en densidad poblacional</p>';
    legendContent.innerHTML = legendHTML;
}

// Load census zones for all cities
async function loadCensusZones() {
    const mapSpinner = document.getElementById('map-spinner');
    try {
        if (censusZonesLayer) map.removeLayer(censusZonesLayer);
        if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);

        densityMax = 0;
        densityMin = Infinity;
        visibleDensities.clear();
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

        // Calculate min/max density
        combinedGeojson.features.forEach(feature => {
            const density = feature.properties.density || 0;
            if (density > 0) {
                visibleDensities.add(density);
                if (density > densityMax) densityMax = density;
                if (density < densityMin) densityMin = density;
            }
        });

        // Compute Quantiles
        const densityArray = Array.from(visibleDensities);
        densityThresholds = getQuantiles(densityArray, 7);

        updateLegend();

        censusZonesLayer = L.geoJSON(combinedGeojson, {
            pane: 'censusPane',
            style: function (feature) {
                const density = feature.properties.density || 0;
                const color = getDensityColor(density);
                return { color: '#333', weight: 1, fillColor: color, fillOpacity: 0.6 };
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const isLH = props.join_key && !isNaN(props.join_key) && parseInt(props.join_key) < 1000; // Simplified check or could use a flag in properties

                // Requirement 5: Remove "Barris" for LH, Bold neighborhood
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

// Handle form submission
document.getElementById('upload-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    // currentCity is not used anymore as we aggregate everything in the backend if needed

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
                style: { color: '#ff0000', weight: 6, dashArray: '10, 10', fillOpacity: 0.1 }
            }).addTo(map);

            if (censusZonesLayer) {
                const intersectingKeys = new Set();
                if (data.statistics && data.statistics.intersecting_zones) {
                    data.statistics.intersecting_zones.forEach(zone => intersectingKeys.add(zone.join_key));
                }

                visibleDensities.clear();
                censusZonesLayer.eachLayer(layer => {
                    const key = layer.feature.properties.join_key;
                    if (intersectingKeys.has(key)) {
                        const density = layer.feature.properties.density || 0;
                        if (density > 0) visibleDensities.add(density);
                        layer.setStyle({ fillOpacity: 0.6, opacity: 1 });
                    } else {
                        layer.setStyle({ fillOpacity: 0, opacity: 0 });
                    }
                });

                // Recalculate range for visible
                let newMax = 0, newMin = Infinity;
                visibleDensities.forEach(d => {
                    if (d > newMax) newMax = d;
                    if (d < newMin) newMin = d;
                });
                if (newMax > 0) {
                    densityMax = newMax;
                    densityMin = newMin;
                    densityThresholds = getQuantiles(Array.from(visibleDensities), 7);
                }

                censusZonesLayer.eachLayer(layer => {
                    if (intersectingKeys.has(layer.feature.properties.join_key)) {
                        const density = layer.feature.properties.density || 0;
                        layer.setStyle({ fillColor: getDensityColor(density) });
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

// Reset view button
document.getElementById('reset-view-btn').addEventListener('click', () => {
    if (censusZonesLayer) {
        // Reset full density range
        densityMax = 0; densityMin = Infinity;
        visibleDensities.clear();
        censusZonesLayer.eachLayer(l => {
            const d = l.feature.properties.density || 0;
            if (d > 0) {
                visibleDensities.add(d);
                if (d > densityMax) densityMax = d;
                if (d < densityMin) densityMin = d;
            }
        });

        densityThresholds = getQuantiles(Array.from(visibleDensities), 7);

        censusZonesLayer.eachLayer(layer => {
            const d = layer.feature.properties.density || 0;
            layer.setStyle({ fillColor: getDensityColor(d), fillOpacity: 0.6, opacity: 1 });
        });
        updateLegend();
        map.fitBounds(censusZonesLayer.getBounds());
    }
});

// Initial load
loadCensusZones();

