# Censo Territorio - Barcelona

Esta aplicación web permite visualizar datos demográficos detallados de Barcelona y realizar cálculos de población en áreas personalizadas definidas mediante archivos KML.

## 📊 Fuentes de Datos (Open Data Barcelona)

El proyecto utiliza datos oficiales del Ayuntamiento de Barcelona:

1.  **Población (Padrón)**: [Habitantes por Sección Censal](https://opendata-ajuntament.barcelona.cat/data/es/dataset/pad_mdbas) (Datos 2025).
2.  **Cartografía (Secciones Censales)**: [Geometrías de Distritos y Barrios](https://opendata-ajuntament.barcelona.cat/data/es/dataset/20170706-districtes-barris) (Secciones Censales en formato WGS84).

## ✨ Características Principales

-   **Mapa Interactivo**: Visualización de las 1.068 secciones censales de Barcelona.
-   **Cálculo por KML**: Sube un polígono en formato `.kml` y obtén la población estimada dentro de esa geometría exacta.
-   **Análisis Dinámico de Monte Carlo**: Ajuste automático de la precisión del cálculo según el número de zonas afectadas.
-   **Leyenda Inteligente**: Escala de colores (densidad de población) que se adapta dinámicamente según los datos visibles.
-   **Estadísticas de Zona**: Desglose de población, densidad por km², distrito y barrio.
-   **Interfaz Moderna**: Micro-animaciones, spinners de carga y diseño oscuro/profesional.

## 🛠️ Instalación

1.  **Clonar el repositorio y entrar en el directorio**:
    ```bash
    git clone https://github.com/erpallaga/Censo-Territorio.git
    cd Censo-Territorio
    ```

2.  **Instalar dependencias**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Archivos de datos necesarios**:
    Asegúrate de tener los siguientes archivos CSV en la raíz (descargables de las fuentes mencionadas):
    - `2025_pad_mdbas.csv`
    - `BarcelonaCiutat_SeccionsCensals.csv`

## 🚀 Uso

1.  **Ejecutar el servidor**:
    ```bash
    python app.py
    ```

2.  **Acceder a la aplicación**:
    Abre `http://localhost:5000` en tu navegador.

3.  **Procesar una zona**:
    - Haz clic en el botón de subida.
    - Selecciona un archivo `.kml` (por ejemplo, generado en Google Earth o My Maps).
    - La aplicación calculará automáticamente la población e iluminará las secciones censales intersectadas.

## 🧠 Detalles Técnicos

### Algoritmo de Localización (Point-In-Polygon)
Se utiliza el algoritmo de **Ray Casting** para determinar qué coordenadas geográficas se encuentran dentro de los complejos límites de las secciones censales.

### Estimación de Población (Monte Carlo)
Cuando un KML intersecta parcialmente múltiples secciones, la población se calcula mediante una simulación de Monte Carlo:
1.  Se generan puntos aleatorios dentro del área de interés.
2.  Se calcula el ratio de puntos que caen dentro de cada sección censal frente al total del polígono KML.
3.  Se aplica este ratio a la población total de la sección para una estimación precisa.
4.  **Muestreo Dinámico**: El sistema aumenta automáticamente el número de puntos (hasta 10,000) en zonas pequeñas o específicas para maximizar la precisión, y lo reduce en áreas muy grandes para mantener el rendimiento.

### Geometría Esférica
Las áreas en km² se calculan utilizando aproximaciones esféricas que consideran la curvatura terrestre, garantizando que los cálculos de densidad sean correctos en latitudes de Barcelona.

## 📁 Estructura del Proyecto

```text
.
├── app.py                      # Servidor Flask (API y Rutas)
├── census_calculator.py        # Núcleo lógico y algoritmos espaciales
├── requirements.txt            # Dependencias (Pandas, NumPy, Flask)
├── templates/
│   └── index.html             # Interfaz de usuario (JavaScript + Leaflet)
├── static/
│   └── style.css              # Diseño y animaciones
├── 2025_pad_mdbas.csv         # Datos demográficos oficiales
└── BarcelonaCiutat_SeccionsCensals.csv  # Límites cartográficos
```

## ⚖️ Licencia

Proyecto desarrollado con fines educativos y de análisis territorial. Datos propiedad del Ayuntamiento de Barcelona bajo licencia Open Data.
