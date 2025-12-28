# Censo Territorio - Web Application

Aplicación web para visualizar datos censales de Barcelona y calcular la población en zonas de interés definidas mediante archivos KML.

## Características

- 🗺️ Visualización interactiva de zonas censales en un mapa
- 📊 Cálculo de población en zonas personalizadas (archivos KML)
- 🎨 Visualización con códigos de color según densidad de población
- 📈 Estadísticas detalladas por zona
- 🔍 Información detallada al hacer clic en zonas censales

## Instalación

1. Instala las dependencias:
```bash
pip install -r requirements.txt
```

2. Asegúrate de que los archivos de datos estén en el directorio raíz:
   - `2025_pad_mdbas.csv` - Datos de población
   - `BarcelonaCiutat_SeccionsCensals.csv` - Geometrías de zonas censales

## Uso

1. Inicia el servidor:
```bash
python app.py
```

2. Abre tu navegador en: `http://localhost:5000`

3. Sube un archivo KML con tu zona de interés para calcular la población

## Estructura del Proyecto

```
.
├── app.py                      # Aplicación Flask principal
├── census_calculator.py        # Funciones de cálculo (point-in-polygon, etc.)
├── requirements.txt            # Dependencias Python
├── templates/
│   └── index.html             # Interfaz web
├── static/
│   └── style.css              # Estilos CSS
├── 2025_pad_mdbas.csv         # Datos de población
└── BarcelonaCiutat_SeccionsCensals.csv  # Geometrías de zonas censales
```

## Tecnologías

- **Backend**: Flask (Python)
- **Frontend**: HTML, CSS, JavaScript
- **Mapas**: Leaflet.js
- **Cálculos**: NumPy, Pandas

## Algoritmo

La aplicación utiliza el algoritmo de ray casting (point-in-polygon) junto con el método de Monte Carlo para calcular la población en zonas que intersectan con el polígono de interés definido en el KML.

## Licencia

Este proyecto es de uso educativo y de investigación.

