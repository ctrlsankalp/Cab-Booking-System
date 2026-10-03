#include <iostream>
#include <emscripten/bind.h>
// #include "real_map_logic.h"

using namespace emscripten;

// Global map manager instance
MapManager mapManager;

// C++ to JavaScript bindings
EMSCRIPTEN_BINDINGS(cab_booking) {
    // Bind Location
    value_object<Location>("Location")
        .field("latitude", &Location::latitude)
        .field("longitude", &Location::longitude);
    
    // Bind MapManager methods
    class_<MapManager>("MapManager")
        .constructor<>()
        .function("findNearestCab", &MapManager::findNearestCab)
        .function("calculateRoute", &MapManager::calculateRoute);
}

// Main function
int main() {
    std::cout << "Cab Booking System Backend Initialized" << std::endl;
    return 0;
}