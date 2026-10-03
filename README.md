# Cab Booking System

An interactive real-world cab booking and dispatch simulation system featuring:
- **C++ Backend (`MapManager` / `CabManager` / `RealMapCabSystem`)**: Core geospatial calculations, fleet dispatching, Haversine road-factor distance calculation, fare estimation, and trip lifecycle state management.
- **Interactive Web UI**: A Leaflet & OpenStreetMap frontend integrating with real-world road networks via OSRM (Open Source Routing Machine) and the Overpass API for live cab spawning, road-following turn-by-turn routing, animations, and dynamic fare computation.

---

## Project Structure

```text
Cab-Booking-System/
├── cab_management.h      # Core Cab & Location models, CabManager fleet operations
├── cab_management.cpp    # CabManager standalone demo / unit runner
├── real_map_logic.h      # RealMapCabSystem & MapManager routing, distance & trip lifecycle
├── real_map_logic.cpp    # RealMapCabSystem implementation & fare calculation
├── main.cpp              # C++ simulation entry point demonstrating end-to-end booking flow
├── index.html            # Web UI with Leaflet map, trip stats sidebar & control bar
├── style.css             # Dark-themed dashboard styling and responsive map layout
├── script.js             # Frontend logic: Overpass road sampling, OSRM road routing, Leaflet animations
├── Makefile              # Cross-platform build configuration (all, run, clean)
├── build.bat             # Windows one-click build and execution script
├── .gitignore            # Git exclusion rules for build outputs and binaries
└── README.md             # Project documentation
```

---

## 1. Building and Running the C++ Application

### Prerequisites
A modern C++ compiler supporting C++14 or C++17 (e.g., GCC/MinGW, Clang, or MSVC).

### Option A: Using Windows `build.bat` (Recommended on Windows)
Simply build:
```cmd
build.bat
```
Or build and run immediately:
```cmd
build.bat run
```

### Option B: Using `make` (Linux / macOS / MinGW)
```bash
make
make run
```
To clean build artifacts:
```bash
make clean
```

### Option C: Direct Compiler Command Line

#### Using `g++` (GCC / MinGW / Clang):
```bash
g++ -std=c++17 -O2 -Wall -o cab_app.exe main.cpp cab_management.cpp real_map_logic.cpp
./cab_app.exe
```

#### Using MSVC (`cl` in Developer Command Prompt):
```cmd
cl /EHsc /std:c++17 /O2 /Fe:cab_app.exe main.cpp cab_management.cpp real_map_logic.cpp
cab_app.exe
```

---

## 2. Running the Interactive Web UI

No external server or build tools are required! You can open the UI directly:

1. **Directly in Browser**:
   - Double-click `index.html` to open it in your default browser.
2. **Via Local HTTP Server** (Recommended for web API fetch compatibility):
   - **Python 3**:
     ```bash
     python -m http.server 8000
     ```
     Navigate to `http://localhost:8000/`.
   - **Node.js**:
     ```bash
     npx serve .
     ```

### Web UI Features
- **Map Interaction**: Click on the map to set a pickup location.
- **Dynamic Cabs**: Real road networks around your location are queried via Overpass API to place available cabs.
- **Live Road Routing**: OSRM table & route APIs calculate the nearest cab along real roads and display turn-by-turn road paths.
- **Animation**: The dispatched cab animates along the polyline path to the pickup point.
- **Trip Dashboard**: View status, route distance, travel duration, ETA, and estimated fare in INR.
- **Drop-off Destination**: Toggle "Enable drop" to select a destination and calculate the onward trip route.

---

## 3. Architecture & Key Concepts

- **`CabManager`**: Fleet container managing availability, cab coordinates, and Euclidean/Haversine nearest-neighbor lookups.
- **`RealMapCabSystem` / `MapManager`**: High-level system coordinating trip state machine (`IDLE` -> `CAB_TO_PICKUP` -> `PICKUP_TO_DROP` -> `COMPLETED`), road distance estimation, and dynamic pricing models.
- **Seamless Naming Compatibility**: The header provides `using MapManager = RealMapCabSystem;` and `calculateRoute()` to ensure zero mismatch across naming conventions.

---

## License
Open-source for educational and project evaluation purposes.
