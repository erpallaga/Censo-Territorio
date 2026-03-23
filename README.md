# Censo Territorio - Barcelona & L'Hospitalet

Aplicación web estática para visualizar datos demográficos de Barcelona y L'Hospitalet de Llobregat, con cálculo de población en áreas personalizadas definidas mediante archivos KML.

## Demo

Desplegado en Vercel como sitio estático puro — sin servidor, sin funciones Lambda.

## Fuentes de Datos (Open Data)

1. **Barcelona**:
   - [Habitantes por Sección Censal](https://opendata-ajuntament.barcelona.cat/data/es/dataset/pad_mdbas) — Padrón 2025
   - [Cartografía de Secciones Censales](https://opendata-ajuntament.barcelona.cat/data/es/dataset/20170706-districtes-barris) — WGS84

2. **L'Hospitalet**:
   - [Padrón Municipal por Barrios](https://opendata-l-h.digital/dataset/habitants-per-barris-i-edades-any-2025) — Datos 2025
   - [Divisiones Territoriales](https://opendata-l-h.digital/dataset/territori-divisions-territorials) — Cartografía de Barrios

## Características Principales

- **Multi-ciudad**: Visualización simultánea de Barcelona (1.068 secciones censales) y L'Hospitalet (13 barrios).
- **Cálculo por KML**: Sube un polígono `.kml` y obtén la población estimada, incluso si el área abarca ambas ciudades.
- **100% en el navegador**: El algoritmo Monte Carlo + ray-casting corre en JavaScript, sin ninguna llamada al servidor.
- **Escalado por cuantiles**: 7 grupos con igual número de zonas, evitando que outliers distorsionen el mapa de calor.
- **Visualización KML**: El área seleccionada se resalta con estilo "Carbon Black" (línea gruesa, color neutro), siempre visible sobre el degradado de densidad.

## Arquitectura

El proyecto es un **sitio estático puro** servido desde `public/`:

```
public/
├── index.html          # Interfaz principal (Leaflet.js)
├── script.js           # Lógica del mapa y carga de datos
├── calculator.js       # Puerto JS del algoritmo Monte Carlo (sin servidor)
├── style.css           # Estilos
└── geojson/
    ├── barcelona.json  # GeoJSON pre-generado (1.068 secciones, ~4 MB)
    └── l_hospitalet.json
```

Los archivos GeoJSON se generan una vez localmente con `scripts/generate_geojson.py` y se commitean al repositorio. Vercel simplemente sirve el directorio `public/` — sin builds, sin Lambdas.

## Detalles Técnicos

### Estimación de Intersección (Monte Carlo)
Para cada zona censal que solapa con el polígono KML, se lanzan entre 1.000 y 10.000 puntos aleatorios dentro del bounding box de la zona. La proporción de puntos que caen dentro del polígono KML estima el porcentaje de población a sumar. El muestreo es dinámico: más puntos cuando hay pocas zonas candidatas, menos cuando hay muchas.

### Escalado por Cuantiles
Para evitar que zonas industriales (densidad baja) o bloques muy densos (densidad alta) oculten la variabilidad del resto, se divide el rango de datos en 7 grupos con igual número de secciones. Cada color de la leyenda representa un segmento real de la distribución local.

### Z-Index de Capas
El polígono KML se renderiza en un pane propio de Leaflet (z-index 650), siempre por encima de las zonas censales, evitando que los colores de densidad oculten el área de estudio.

---

## Desarrollo Local

### Ejecutar la app

La app es estática — cualquier servidor HTTP sirve:

```bash
cd public
python -m http.server 8000
# Abre http://localhost:8000
```

O con Node.js:
```bash
npx serve public
```

### Regenerar los GeoJSON

Solo necesario si cambian los datos fuente (CSV). Requiere Python con las dependencias de `requirements.txt`:

```bash
# 1. Instalar dependencias
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -r requirements.txt

# 2. Colocar los archivos de datos:
#    - /2025_pad_mdbas.csv
#    - /BarcelonaCiutat_SeccionsCensals.csv
#    - /L'Hospitalet/06ff0a2d-f6f8-4bf5-9ac1-ed09fda42a8b.csv
#    - /L'Hospitalet/TERRITORI_DIVISIONS_BAR.csv

# 3. Generar GeoJSON
python scripts/generate_geojson.py
# Genera public/geojson/barcelona.json y public/geojson/l_hospitalet.json
```

Los archivos generados deben commitearse al repositorio para que Vercel los sirva.

---

## Estructura del Proyecto

```
.
├── public/                         # Sitio estático (lo que sirve Vercel)
│   ├── index.html
│   ├── script.js
│   ├── calculator.js               # Algoritmo Monte Carlo en JS
│   ├── style.css
│   └── geojson/
│       ├── barcelona.json
│       └── l_hospitalet.json
├── scripts/
│   └── generate_geojson.py         # Regenera los GeoJSON desde los CSV
├── api/                            # Código Python de referencia (no se usa en prod)
│   └── _shared/
│       ├── data_loader.py
│       └── census_calculator.py
├── vercel.json                     # { "outputDirectory": "public" }
├── requirements.txt                # Solo necesario para regenerar GeoJSON
├── 2025_pad_mdbas.csv              # Datos demográficos BCN
└── BarcelonaCiutat_SeccionsCensals.csv
```

## Licencia

Proyecto desarrollado con fines educativos y de análisis territorial. Datos propiedad de los Ayuntamientos de Barcelona y L'Hospitalet bajo licencias de datos abiertos.
