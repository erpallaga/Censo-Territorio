# Censo Territorio - Barcelona & L'Hospitalet

Esta aplicación web permite visualizar datos demográficos detallados de Barcelona y L'Hospitalet de Llobregat, permitiendo realizar cálculos de población en áreas personalizadas definidas mediante archivos KML.

## 📊 Fuentes de Datos (Open Data)

El proyecto utiliza datos oficiales de los ayuntamientos:

1.  **Barcelona**:
    - [Habitantes por Sección Censal](https://opendata-ajuntament.barcelona.cat/data/es/dataset/pad_mdbas) (Padrón 2025).
    - [Cartografía de Secciones Censales](https://opendata-ajuntament.barcelona.cat/data/es/dataset/20170706-districtes-barris) (WGS84).
2.  **L'Hospitalet**:
    - [Padrón Municipal por Barrios](https://opendata-l-h.digital/dataset/habitants-per-barris-i-edades-any-2025) (Datos 2025).
    - [Divisiones Territoriales](https://opendata-l-h.digital/dataset/territori-divisions-territorials) (Cartografía de Barrios).

## ✨ Características Principales

-   **Integración Multi-Ciudad**: Visualización y cálculo simultáneo para Barcelona y L'Hospitalet.
-   **Cálculo Agregado por KML**: Sube un polígono `.kml` y obtén la población total estimada, incluso si el área abarca ambas ciudades.
-   **Visualización KML Optimizada**: El área seleccionada se resalta con un estilo "Carbon Black" (línea gruesa punteada de color neutro) optimizado para destacar sobre cualquier degradado de color y mapa base.
-   **Escalado por Cuantiles**: Visualización inteligente de la densidad de población mediante percentiles, asegurando una distribución de colores equilibrada que resalta las variaciones locales sin verse afectada por valores extremos (outliers).
-   **Análisis de Monte Carlo**: Estimación precisa de población en intersecciones mediante muestreo aleatorio dinámico.
-   **Interfaz Moderna**: Spinner de carga integrado en el mapa, diseño profesional y visualización de datos detallada en popups.

## 🛠️ Instalación

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/erpallaga/Censo-Territorio.git
    cd Censo-Territorio
    ```

2.  **Preparar el entorno virtual** (si no existe):
    ```powershell
    python -m venv venv
    ```

3.  **Activar el entorno e instalar dependencias**:
    ```powershell
    .\venv\Scripts\activate
    pip install -r requirements.txt
    ```

4.  **Archivos de datos**:
    El proyecto requiere que los archivos CSV estén organizados de la siguiente manera:
    - `/2025_pad_mdbas.csv` (BCN Padrón)
    - `/BarcelonaCiutat_SeccionsCensals.csv` (BCN Geometría)
    - `/L'Hospitalet/06ff0a2d-f6f8-4bf5-9ac1-ed09fda42a8b.csv` (LH Padrón)
    - `/L'Hospitalet/TERRITORI_DIVISIONS_BAR.csv` (LH Geometría)

## 🚀 Uso

1.  **Ejecutar el servidor**:
    Utilizando el entorno virtual directamente:
    ```powershell
    .\venv\Scripts\python.exe app.py
    ```

2.  **Acceder a la aplicación**:
    Abre `http://localhost:5000` en tu navegador. Ambas ciudades se cargarán automáticamente.

3.  **Procesar una zona**:
    - Sube un archivo `.kml`.
    - La aplicación sumará la población de todas las zonas (de ambas ciudades) intersectadas por el polígono.

## 🧠 Detalles Técnicos

### Color por Cuantiles
Para evitar que las zonas industriales o parques (densidad baja) y los bloques densos (densidad alta) oculten la variabilidad del resto del mapa, implementamos una escala de cuantiles. Esto divide los datos en 7 grupos con igual número de secciones, permitiendo que cada color de la leyenda represente un segmento real de la población local.

### Estimación de Intersección
Se utiliza una simulación de Monte Carlo con muestreo dinámico (hasta 10,000 puntos) para estimar qué porcentaje de la población de cada zona censal recae dentro del polígono KML subido por el usuario.

### Gestión de Capas (Z-Index)
Para garantizar la visibilidad de las selecciones del usuario, se implementaron panes personalizados en Leaflet. El polígono KML se renderiza en un pane superior (z-index 650), manteniéndose siempre por encima de las zonas censales y el mapa base, evitando que los colores de densidad oculten los límites del área de estudio.

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

Proyecto desarrollado con fines educativos y de análisis territorial. Datos propiedad de los Ayuntamientos de Barcelona y L'Hospitalet bajo licencias de datos abiertos.
