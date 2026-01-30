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

let censusZonesLayer = null;
let uploadedZoneLayer = null;
let densityMax = 0;
let densityMin = Infinity;

// Function to get color based on density ratio (7-step gradation)
function getDensityColor(ratio) {
    // 7-step color scale: green -> light green -> yellow-green -> yellow -> orange -> red-orange -> red
    if (ratio < 0.14) {
        return '#006837'; // Dark green
    } else if (ratio < 0.28) {
        return '#238b45'; // Medium green
    } else if (ratio < 0.43) {
        return '#74c476'; // Light green
    } else if (ratio < 0.57) {
        return '#fed976'; // Yellow
    } else if (ratio < 0.71) {
        return '#fd8d3c'; // Orange
    } else if (ratio < 0.86) {
        return '#e31a1c'; // Red-orange
    } else {
        return '#99000d'; // Dark red
    }
}

// Global variable to store visible densities for legend calculation
let visibleDensities = new Set();

// Function to update dynamic legend
function updateLegend() {
    const legendContent = document.getElementById('legend-content');
    if (densityMax === 0 || densityMin === Infinity) {
        legendContent.innerHTML = '<p style="font-size: 0.9em; color: #666; font-style: italic;">Cargando...</p>';
        return;
    }

    // Collect unique density values and count them
    const uniqueDensities = Array.from(visibleDensities).sort((a, b) => a - b);
    const numUnique = uniqueDensities.length;

    // Calculate steps (between 1 and 7)
    let steps = Math.min(numUnique, 7);
    if (steps === 0) steps = 1;

    let legendHTML = '<div style="margin-bottom: 8px;">';

    if (densityMax === densityMin || steps === 1) {
        // Special case: Only one value or all values are the same
        const color = getDensityColor(0.5); // Use a neutral color from the scale
        legendHTML += `
            <div class="legend-item" style="margin-bottom: 6px;">
                <div class="legend-color" style="background: ${color};"></div>
                <span style="font-size: 0.85em;">${Math.round(densityMax).toLocaleString()} hab/km²</span>
            </div>
        `;
    } else {
        const stepSize = (densityMax - densityMin) / steps;

        // Generate legend items for each color step
        for (let i = 0; i < steps; i++) {
            const ratio = i / (steps - 1);
            const color = getDensityColor(ratio);
            const minD = densityMin + (stepSize * i);
            const maxD = i === steps - 1 ? densityMax : densityMin + (stepSize * (i + 1));

            legendHTML += `
                <div class="legend-item" style="margin-bottom: 6px;">
                    <div class="legend-color" style="background: ${color};"></div>
                    <span style="font-size: 0.85em;">${Math.round(minD).toLocaleString()} - ${Math.round(maxD).toLocaleString()} hab/km²</span>
                </div>
            `;
        }
    }

    legendHTML += '</div>';
    legendHTML += '<p style="margin-top: 10px; font-size: 0.85em; color: #666;">Basado en densidad poblacional</p>';
    legendContent.innerHTML = legendHTML;
}

// Load census zones on page load
async function loadCensusZones() {
    try {
        // Load all census zones
        const response = await fetch('/api/census-zones');
        const geojson = await response.json();

        // Calculate min/max density and unique values for color scaling
        visibleDensities.clear();
        geojson.features.forEach(feature => {
            const density = feature.properties.density || 0;
            if (density > 0) {
                visibleDensities.add(density);
                if (density > densityMax) densityMax = density;
                if (density < densityMin) densityMin = density;
            }
        });

        // Update dynamic legend
        updateLegend();

        // Add zones to map with color coding based on density
        censusZonesLayer = L.geoJSON(geojson, {
            pane: 'censusPane',
            style: function (feature) {
                const density = feature.properties.density || 0;
                const ratio = densityMax > densityMin ? (density - densityMin) / (densityMax - densityMin) : 0.5;
                const color = getDensityColor(ratio);

                return {
                    color: '#333',
                    weight: 1,
                    fillColor: color,
                    fillOpacity: 0.6
                };
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const density = props.density || 0;
                const area = props.area_km2 || 0;
                layer.bindPopup(`
                    <strong>${props.district}</strong><br>
                    ${props.neighborhood}<br>
                    Sección: ${props.district_code}${props.section_code}<br>
                    Población: <strong>${props.population.toLocaleString()}</strong><br>
                    Área: ${area.toFixed(2)} km²<br>
                    Densidad: <strong>${density.toLocaleString()} hab/km²</strong>
                `);

                layer.on('click', function () {
                    layer.setStyle({ weight: 3, color: '#0066cc' });
                    setTimeout(() => {
                        layer.setStyle({ weight: 1, color: '#333' });
                    }, 2000);
                });
            }
        }).addTo(map);
    } catch (error) {
        console.error('Error loading census zones:', error);
        alert('Error al cargar las zonas censales');
    }
}

// Handle form submission
document.getElementById('upload-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const fileInput = document.getElementById('kml-file');

    if (!fileInput.files[0]) {
        alert('Por favor selecciona un archivo KML');
        return;
    }

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
            // Display statistics
            document.getElementById('total-population').textContent =
                data.population.toLocaleString();

            statsPanel.classList.add('show');

            // Add uploaded zone to map (transparent, only border, behind census zones)
            if (uploadedZoneLayer) {
                map.removeLayer(uploadedZoneLayer);
            }

            uploadedZoneLayer = L.geoJSON(data.geojson, {
                pane: 'kmlPane',
                style: {
                    color: '#ff0000',
                    weight: 6,
                    dashArray: '10, 10',
                    fillColor: '#ff0000',
                    fillOpacity: 0.1,
                    opacity: 1
                }
            }).addTo(map);

            // Filter census zones to only show intersecting ones
            if (censusZonesLayer) {
                // Get intersecting zone codes from statistics (these are calculated using proper polygon intersection)
                const intersectingCodes = new Set();
                if (data.statistics && data.statistics.intersecting_zones) {
                    data.statistics.intersecting_zones.forEach(zone => {
                        const code = `${zone.district_code.toString().padStart(2, '0')}${zone.section_code.toString().padStart(3, '0')}`;
                        intersectingCodes.add(parseInt(code));
                    });
                }

                // Collect visible zones to recalculate density range
                const visibleZones = [];
                visibleDensities.clear();

                // Filter zones: hide non-intersecting ones (ONLY use zone codes from backend, no bbox fallback)
                censusZonesLayer.eachLayer(function (layer) {
                    if (layer.feature && layer.feature.properties) {
                        const props = layer.feature.properties;

                        // Create zone code like backend does
                        const zoneCode = parseInt(`${props.district_code.toString().padStart(2, '0')}${props.section_code.toString().padStart(3, '0')}`);

                        // Check if zone intersects - ONLY use codes from backend statistics (proper polygon intersection)
                        const intersects = intersectingCodes.has(zoneCode);

                        if (!intersects) {
                            // Hide non-intersecting zones
                            layer.setStyle({ fillOpacity: 0, opacity: 0 });
                        } else {
                            // Collect for density recalculation
                            visibleZones.push(props);
                            if (props.density > 0) visibleDensities.add(props.density);
                        }
                    }
                });

                // Recalculate density min/max based only on visible zones
                let newDensityMax = 0;
                let newDensityMin = Infinity;
                visibleZones.forEach(props => {
                    const density = props.density || 0;
                    if (density > 0) {
                        if (density > newDensityMax) newDensityMax = density;
                        if (density < newDensityMin) newDensityMin = density;
                    }
                });

                // Update global density range
                if (newDensityMax > 0 && newDensityMin < Infinity) {
                    densityMax = newDensityMax;
                    densityMin = newDensityMin;
                }

                // Update colors for visible zones with new density range
                censusZonesLayer.eachLayer(function (layer) {
                    if (layer.feature && layer.feature.properties) {
                        const props = layer.feature.properties;
                        const zoneCode = parseInt(`${props.district_code.toString().padStart(2, '0')}${props.section_code.toString().padStart(3, '0')}`);
                        const intersects = intersectingCodes.has(zoneCode);

                        if (intersects) {
                            // Update color with new density range
                            const density = props.density || 0;
                            const ratio = densityMax > densityMin ? (density - densityMin) / (densityMax - densityMin) : 0.5;
                            const color = getDensityColor(ratio);
                            layer.setStyle({
                                fillColor: color,
                                fillOpacity: 0.6,
                                opacity: 1,
                                weight: 1,
                                color: '#333'
                            });
                        }
                    }
                });

                // Update legend with new density range
                updateLegend();

                // Ensure census zones are on top
                censusZonesLayer.bringToFront();
            }

            // Zoom to uploaded polygon with padding
            map.fitBounds(uploadedZoneLayer.getBounds(), { padding: [50, 50] });
        } else {
            alert('Error: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar el archivo KML');
    } finally {
        setTimeout(() => {
            loading.classList.remove('show');
        }, 500);
        calculateBtn.disabled = false;
    }
});

// Function to reset view - show all zones
function resetView() {
    if (censusZonesLayer) {
        censusZonesLayer.eachLayer(function (layer) {
            if (layer.feature && layer.feature.properties) {
                const density = layer.feature.properties.density || 0;
                const ratio = densityMax > densityMin ? (density - densityMin) / (densityMax - densityMin) : 0;
                const color = getDensityColor(ratio);
                layer.setStyle({
                    fillColor: color,
                    fillOpacity: 0.6,
                    opacity: 1,
                    weight: 1,
                    color: '#333'
                });
            }
        });
    }
    if (censusZonesLayer) {
        map.fitBounds(censusZonesLayer.getBounds());
    }
}

// Reset view button
document.getElementById('reset-view-btn').addEventListener('click', resetView);

// Load census zones on page load
loadCensusZones();
