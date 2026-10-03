#include <iostream>
#include <iomanip>
#include <cassert>
#include <cmath>
#include "cab_management.h"
#include "real_map_logic.h"

using namespace std;

void runEtaValidationTests() {
    cout << "\n========================================\n";
    cout << "     RUNNING ETA & SPEED VALIDATION     \n";
    cout << "========================================\n";

    RealMapCabSystem system(DEFAULT_URBAN_SPEED_KMH);

    // Test 1: ~9 km test case (The benchmark problem)
    // 9 km at 24 km/h should be 22.5 minutes (expected range 22-25 mins, NOT 13 mins)
    double dur9km = system.calculateTravelDuration(9000.0);
    double min9km = dur9km / 60.0;
    cout << "[TEST 1] 9.0 km travel time: " << min9km << " mins (Formatted: "
         << system.formatDuration(dur9km) << ")\n";
    assert(min9km >= 22.0 && min9km <= 25.0);
    assert(!std::isnan(min9km) && min9km > 0.0);

    // Test 2: ~5 km test case
    // 5 km at 24 km/h should be ~12.5 minutes (expected range 12-14 mins)
    double dur5km = system.calculateTravelDuration(5000.0);
    double min5km = dur5km / 60.0;
    cout << "[TEST 2] 5.0 km travel time: " << min5km << " mins (Formatted: "
         << system.formatDuration(dur5km) << ")\n";
    assert(min5km >= 12.0 && min5km <= 14.0);
    assert(!std::isnan(min5km) && min5km > 0.0);

    // Test 3: ~15 km test case
    // 15 km at 24 km/h should be ~37.5 minutes (expected range 36-41 mins)
    double dur15km = system.calculateTravelDuration(15000.0);
    double min15km = dur15km / 60.0;
    cout << "[TEST 3] 15.0 km travel time: " << min15km << " mins (Formatted: "
         << system.formatDuration(dur15km) << ")\n";
    assert(min15km >= 36.0 && min15km <= 41.0);
    assert(!std::isnan(min15km) && min15km > 0.0);

    // Test 4: Very short distance (100 meters)
    // Should respect minimum duration floor (>= 1.0 min) without 0, negative, or NaN
    double durShort = system.calculateTravelDuration(100.0);
    double minShort = durShort / 60.0;
    cout << "[TEST 4] Very short (100 m) travel time: " << minShort << " mins (Floor enforced: "
         << system.formatDuration(durShort) << ")\n";
    assert(minShort >= 1.0);
    assert(!std::isnan(minShort) && minShort > 0.0);

    // Test 5: Overly optimistic raw engine duration (e.g. 780s / 13 mins for 9 km = 41.5 km/h)
    // System must detect impossible urban speed (> 35 km/h) and clamp to realistic urban model
    double durClamped = system.calculateTravelDuration(9000.0, 780.0);
    double minClamped = durClamped / 60.0;
    cout << "[TEST 5] 9.0 km with raw 13 min (41.5 km/h) engine output: Clamped to "
         << minClamped << " mins\n";
    assert(minClamped >= 22.0 && minClamped <= 25.0);

    // Test 6: Realistic routing engine duration (e.g. 1200s / 20 mins for 5 km = 15 km/h)
    // Within 5-35 km/h bounds -> must use routing engine duration directly
    double durEngine = system.calculateTravelDuration(5000.0, 1200.0);
    double minEngine = durEngine / 60.0;
    cout << "[TEST 6] 5.0 km with realistic 20 min (15 km/h) engine output: Used directly = "
         << minEngine << " mins\n";
    assert(minEngine == 20.0);

    // Test 7: No available cab scenario
    RealMapCabSystem emptyFleet;
    bool tripStarted = emptyFleet.startTrip(Location(28.6139, 77.2090));
    cout << "[TEST 7] No available cab trip attempt: "
         << (tripStarted ? "STARTED (Unexpected)" : "PROPERLY REJECTED") << "\n";
    assert(!tripStarted);

    // Test 8: Route calculation fallback (missing duration, <= 0)
    double durFallback = system.calculateTravelDuration(9000.0, -1.0);
    cout << "[TEST 8] Route engine failure fallback for 9 km: "
         << (durFallback / 60.0) << " mins (Fallback active)\n";
    assert((durFallback / 60.0) >= 22.0 && (durFallback / 60.0) <= 25.0);

    cout << "\n>>> ALL 8 ETA VALIDATION TESTS PASSED SUCCESSFULLY! <<<\n";
    cout << "========================================\n\n";
}

int main() {
    cout << "========================================\n";
    cout << "       CAB BOOKING SYSTEM - DEMO        \n";
    cout << "========================================\n\n";

    // Initialize MapManager (RealMapCabSystem) with default realistic urban speed (24 km/h)
    MapManager cabSystem(DEFAULT_URBAN_SPEED_KMH);

    // Add sample cabs with realistic coordinates (New Delhi)
    cabSystem.addCab(1, Location(28.6139, 77.2090));  // Connaught Place vicinity
    cabSystem.addCab(2, Location(28.6140, 77.2100));  // Near Janpath
    cabSystem.addCab(3, Location(28.6200, 77.2200));  // Barakhamba Road
    cabSystem.addCab(4, Location(28.6280, 77.2050));  // Shivaji Stadium

    // Display available fleet
    cout << "Configured Urban Speed: " << cabSystem.getAverageSpeedKmh() << " km/h\n";
    cout << "Registered Fleet (" << cabSystem.getCabs().size() << " cabs total):\n";
    for (const auto &cab : cabSystem.getCabs()) {
        cout << "  [Cab #" << cab.id << "] "
             << "Lat: " << fixed << setprecision(4) << cab.position.latitude
             << ", Lng: " << cab.position.longitude
             << " | Status: " << (cab.available ? "AVAILABLE" : "OCCUPIED") << "\n";
    }
    cout << "\nAvailable cabs count: " << cabSystem.getAvailableCabsCount() << "\n\n";

    // Scenario: User requests a pickup
    Location pickup(28.6139, 77.2090);
    Location drop(28.6300, 77.2200);

    cout << "--- Step 1: Requesting Pickup at (" << pickup.latitude << ", " << pickup.longitude << ") ---\n";
    int nearestCabId = cabSystem.findNearestCab(pickup);
    cout << "Nearest available cab found: ID #" << nearestCabId << "\n";

    if (cabSystem.startTrip(pickup)) {
        TripPhase trip = cabSystem.getCurrentTrip();
        cout << "Trip initiated successfully!\n";
        cout << "  Assigned Cab: #" << trip.assignedCabId << "\n";
        cout << "  Distance to Pickup: " << cabSystem.formatDistance(trip.currentRoute.totalDistance) << "\n";
        cout << "  Estimated Duration: " << cabSystem.formatDuration(trip.currentRoute.estimatedDuration) << "\n\n";

        cout << "--- Step 2: Setting Drop Location at (" << drop.latitude << ", " << drop.longitude << ") ---\n";
        if (cabSystem.addDropLocation(drop)) {
            trip = cabSystem.getCurrentTrip();
            cout << "Drop location confirmed!\n";
            cout << "  Distance Pickup -> Drop: " << cabSystem.formatDistance(trip.currentRoute.totalDistance) << "\n";
            cout << "  Estimated Trip Time: " << cabSystem.formatDuration(trip.currentRoute.estimatedDuration) << "\n";
            cout << "  Estimated Fare: " << cabSystem.formatCurrency(trip.currentRoute.estimatedFare) << "\n\n";

            cout << "--- Step 3: Completing Trip ---\n";
            cabSystem.completeTrip();
            cout << "Trip completed successfully. Cab #" << nearestCabId << " is now at destination and available again.\n";
            cout << "Available cabs count: " << cabSystem.getAvailableCabsCount() << "\n";
        } else {
            cout << "Error: Failed to set drop location.\n";
        }
    } else {
        cout << "Error: No available cabs to dispatch.\n";
    }

    // Run automated validation suite covering all edge cases and speed requirements
    runEtaValidationTests();

    return 0;
}