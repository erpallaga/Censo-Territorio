const MOBILE_BREAKPOINT = 768;

const map = L.map("map", {
    zoomControl: true
}).setView([41.3851, 2.1734], 12);

if (!map.getPane("kmlPane")) {
    map.createPane("kmlPane");
    map.getPane("kmlPane").style.zIndex = 650;
}

if (!map.getPane("censusPane")) {
    map.createPane("censusPane");
    map.getPane("censusPane").style.zIndex = 500;
}

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let censusZonesLayer = null;
let uploadedZoneLayer = null;
const cities = ["barcelona", "l_hospitalet"];
let currentMode = "density";

let densityMax = 0;
let densityMin = Infinity;
const visibleDensities = new Set();
let densityThresholds = [];

let populationMax = 0;
let populationMin = Infinity;
const visiblePopulations = new Set();
let populationThresholds = [];

const densityColors = ["#006837", "#238b45", "#74c476", "#fed976", "#fd8d3c", "#e31a1c", "#99000d"];
const populationColors = ["#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"];

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("kml-file");
const dropzoneText = document.getElementById("dropzone-text");
const uploadForm = document.getElementById("upload-form");
const loading = document.getElementById("loading");
const statsPanel = document.getElementById("stats-panel");
const calculateBtn = document.getElementById("calculate-btn");
const resetViewBtn = document.getElementById("reset-view-btn");

function setHasResultsState(enabled) {
    document.body.classList.toggle("has-results", enabled);
}

function setResetEnabled(enabled) {
    resetViewBtn.disabled = !enabled;
}

function isMobileViewport() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function getMapPadding() {
    return isMobileViewport() ? [24, 24] : [50, 50];
}

function invalidateMapSize() {
    window.requestAnimationFrame(() => {
        map.invalidateSize();
    });
}

function focusMapSection() {
    if (!isMobileViewport()) return;

    const mapSection = document.querySelector(".map-section");
    if (!mapSection) return;

    mapSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

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

function getFeatureColor(feature) {
    if (currentMode === "population") {
        return getPopulationColor(feature.properties.population || 0);
    }

    return getDensityColor(feature.properties.density || 0);
}

function getQuantiles(data, numBuckets) {
    if (data.length === 0) return [];

    const sorted = [...data].sort((a, b) => a - b);
    const quantiles = [];

    for (let i = 1; i < numBuckets; i += 1) {
        const index = (i / numBuckets) * (sorted.length - 1);
        const low = Math.floor(index);
        const high = Math.ceil(index);
        const weight = index - low;
        quantiles.push(sorted[low] * (1 - weight) + sorted[high] * weight);
    }

    return quantiles;
}

function applyVisualization() {
    if (!censusZonesLayer) return;

    censusZonesLayer.eachLayer((layer) => {
        if (layer.options && layer.options.fillOpacity === 0) return;

        const color = getFeatureColor(layer.feature);
        layer.setStyle({ fillColor: color });
    });
}

function updateLegend() {
    const legendContent = document.getElementById("legend-content");
    const isDensity = currentMode === "density";
    const colors = isDensity ? densityColors : populationColors;
    const thresholds = isDensity ? densityThresholds : populationThresholds;
    const minVal = isDensity ? densityMin : populationMin;
    const maxVal = isDensity ? densityMax : populationMax;
    const unit = isDensity ? "hab/km2" : "hab";
    const basedOn = isDensity ? "densidad poblacional" : "poblacion absoluta";

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
        for (let i = 0; i < colors.length; i += 1) {
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

    legendHTML += "</div>";
    legendHTML += `<p style="margin-top: 10px; font-size: 0.85em; color: #666;">Basado en ${basedOn}</p>`;
    legendContent.innerHTML = legendHTML;
}

function computeStatsFromFeatures(features) {
    densityMax = 0;
    densityMin = Infinity;
    populationMax = 0;
    populationMin = Infinity;
    visibleDensities.clear();
    visiblePopulations.clear();

    features.forEach((feature) => {
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

async function loadCensusZones() {
    const mapSpinner = document.getElementById("map-spinner");

    try {
        if (censusZonesLayer) map.removeLayer(censusZonesLayer);
        if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);

        updateLegend();
        if (mapSpinner) mapSpinner.classList.add("show");

        const fetchPromises = cities.map((city) =>
            fetch(`/api/census-zones?city=${city}`).then((response) => response.json())
        );

        const results = await Promise.all(fetchPromises);
        const combinedGeojson = {
            type: "FeatureCollection",
            features: []
        };

        results.forEach((geojson) => {
            if (geojson.features) {
                combinedGeojson.features.push(...geojson.features);
            }
        });

        computeStatsFromFeatures(combinedGeojson.features);
        updateLegend();

        censusZonesLayer = L.geoJSON(combinedGeojson, {
            pane: "censusPane",
            style(feature) {
                const color = getFeatureColor(feature);
                return { color: "#24453d", weight: 1, fillColor: color, fillOpacity: 0.6 };
            },
            onEachFeature(feature, layer) {
                const props = feature.properties;
                const isLH = props.join_key && !Number.isNaN(Number.parseInt(props.join_key, 10)) && Number.parseInt(props.join_key, 10) < 1000;

                let popupContent = "";
                if (props.district && props.district !== "Barris") {
                    popupContent += `<strong>${props.district}</strong><br>`;
                }

                const neighborhoodLabel = (props.district === "Barris" || isLH)
                    ? `<strong>${props.neighborhood}</strong>`
                    : props.neighborhood;

                popupContent += `${neighborhoodLabel}<br>`;
                popupContent += `Poblacion: <strong>${props.population.toLocaleString()}</strong><br>
                    Area: ${(props.area_km2 || 0).toFixed(2)} km2<br>
                    Densidad: <strong>${(props.density || 0).toLocaleString()} hab/km2</strong>`;

                layer.bindPopup(popupContent);
            }
        }).addTo(map);

        map.fitBounds(censusZonesLayer.getBounds(), { padding: getMapPadding() });
        invalidateMapSize();
    } catch (error) {
        console.error("Error loading census zones:", error);
        alert("Error al cargar las zonas censales");
    } finally {
        if (mapSpinner) mapSpinner.classList.remove("show");
    }
}

document.querySelectorAll(".legend-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (btn.dataset.mode === currentMode) return;

        document.querySelectorAll(".legend-toggle-btn").forEach((button) => button.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        updateLegend();
        applyVisualization();
    });
});

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
}

["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add("dragover"), false);
});

["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove("dragover"), false);
});

dropzone.addEventListener("drop", (event) => {
    const { files } = event.dataTransfer;
    if (files.length > 0) {
        fileInput.files = files;
        handleFiles(files[0]);
    }
});

fileInput.addEventListener("change", function onFileChange() {
    if (this.files.length > 0) {
        handleFiles(this.files[0]);
    }
});

function handleFiles(file) {
    if (file.name.toLowerCase().endsWith(".kml")) {
        dropzoneText.textContent = `Archivo cargado: ${file.name}`;
        dropzoneText.classList.add("has-file");

        const reader = new FileReader();
        reader.onload = function onLoad(event) {
            const kmlText = event.target.result;

            try {
                const geojson = simpleKMLToGeoJSON(kmlText, file.name);
                if (geojson) {
                    if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);

                    uploadedZoneLayer = L.geoJSON(geojson, {
                        pane: "kmlPane",
                        style: {
                            color: "#2D3436",
                            weight: 5,
                            opacity: 1,
                            dashArray: "10, 10",
                            fillColor: "#2D3436",
                            fillOpacity: 0.1
                        }
                    }).addTo(map);

                    map.fitBounds(uploadedZoneLayer.getBounds(), { padding: getMapPadding() });
                    invalidateMapSize();
                    focusMapSection();
                }
            } catch (error) {
                console.error("Error parsing KML for preview", error);
            }

            window.setTimeout(() => {
                uploadForm.requestSubmit();
            }, 50);
        };

        reader.readAsText(file);
    } else {
        dropzoneText.textContent = "Error: por favor, sube un archivo KML valido";
        dropzoneText.classList.remove("has-file");
        fileInput.value = "";
    }
}

function simpleKMLToGeoJSON(kmlText, filename) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, "text/xml");

    let coordsStr = null;
    const allElements = xmlDoc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i += 1) {
        if (allElements[i].localName === "coordinates") {
            coordsStr = allElements[i].textContent;
            break;
        }
    }

    if (!coordsStr) return null;

    const coordsList = coordsStr.trim().split(/\s+/);
    const coordinates = coordsList.map((coord) => {
        const parts = coord.split(",");
        return [Number.parseFloat(parts[0]), Number.parseFloat(parts[1])];
    }).filter((coord) => !Number.isNaN(coord[0]) && !Number.isNaN(coord[1]));

    if (coordinates.length < 3) return null;

    return {
        type: "Feature",
        properties: { name: filename },
        geometry: {
            type: "Polygon",
            coordinates: [coordinates]
        }
    };
}

uploadForm.addEventListener("submit", async function onSubmit(event) {
    event.preventDefault();
    const formData = new FormData(this);

    loading.classList.add("show");
    statsPanel.classList.remove("show");
    calculateBtn.disabled = true;

    try {
        const response = await fetch("/api/calculate-population", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            setHasResultsState(true);
            setResetEnabled(true);
            document.getElementById("total-population").textContent = data.population.toLocaleString();
            statsPanel.classList.add("show");

            if (uploadedZoneLayer) map.removeLayer(uploadedZoneLayer);

            uploadedZoneLayer = L.geoJSON(data.geojson, {
                pane: "kmlPane",
                style: {
                    color: "#2D3436",
                    weight: 5,
                    opacity: 1,
                    dashArray: "10, 10",
                    fillColor: "#2D3436",
                    fillOpacity: 0.1
                }
            }).addTo(map);

            if (censusZonesLayer) {
                const intersectingKeys = new Set();
                if (data.statistics && data.statistics.intersecting_zones) {
                    data.statistics.intersecting_zones.forEach((zone) => intersectingKeys.add(zone.join_key));
                }

                const visibleFeatures = [];
                censusZonesLayer.eachLayer((layer) => {
                    const key = layer.feature.properties.join_key;
                    if (intersectingKeys.has(key)) {
                        visibleFeatures.push(layer.feature);
                        layer.setStyle({ fillOpacity: 0.6, opacity: 1 });
                    } else {
                        layer.setStyle({ fillOpacity: 0, opacity: 0 });
                    }
                });

                computeStatsFromFeatures(visibleFeatures);

                censusZonesLayer.eachLayer((layer) => {
                    if (intersectingKeys.has(layer.feature.properties.join_key)) {
                        const color = getFeatureColor(layer.feature);
                        layer.setStyle({ fillColor: color });
                    }
                });

                updateLegend();
                censusZonesLayer.bringToFront();
            }

            map.fitBounds(uploadedZoneLayer.getBounds(), { padding: getMapPadding() });
            invalidateMapSize();
            focusMapSection();
        } else {
            setHasResultsState(false);
            setResetEnabled(false);
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        setHasResultsState(false);
        setResetEnabled(false);
        console.error("Error:", error);
        alert("Error al procesar el archivo KML");
    } finally {
        loading.classList.remove("show");
        calculateBtn.disabled = false;
    }
});

resetViewBtn.addEventListener("click", () => {
    if (!censusZonesLayer) return;

    const allFeatures = [];
    censusZonesLayer.eachLayer((layer) => {
        allFeatures.push(layer.feature);
    });

    computeStatsFromFeatures(allFeatures);

    censusZonesLayer.eachLayer((layer) => {
        const color = getFeatureColor(layer.feature);
        layer.setStyle({ fillColor: color, fillOpacity: 0.6, opacity: 1 });
    });

    updateLegend();
    map.fitBounds(censusZonesLayer.getBounds(), { padding: getMapPadding() });
    invalidateMapSize();
    focusMapSection();
});

window.addEventListener("resize", invalidateMapSize);
window.addEventListener("orientationchange", () => {
    window.setTimeout(invalidateMapSize, 150);
});

loadCensusZones().finally(() => {
    setResetEnabled(false);
    invalidateMapSize();
});
