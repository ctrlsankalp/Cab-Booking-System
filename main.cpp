#include <iostream>
#include <iomanip>
#include "cab_management.h"
#include "real_map_logic.h"

using namespace std;

int main() {
    cout << "========================================\n";
    cout << "       CAB BOOKING SYSTEM - DEMO        \n";
    cout << "========================================\n\n";

    // Initialize MapManager (RealMapCabSystem)
    MapManager cabSystem;

    // Add sample cabs with realistic coordinates (New Delhi)
    cabSystem.addCab(1, Location(28.6139, 77.2090));  // Connaught Place vicinity
    cabSystem.addCab(2, Location(28.6140, 77.2100));  // Near Janpath
    cabSystem.addCab(3, Location(28.6200, 77.2200));  // Barakhamba Road
    cabSystem.addCab(4, Location(28.6280, 77.2050));  // Shivaji Stadium

    // Display available fleet
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

    cout << "\n========================================\n";
    cout << "Backend initialization and simulation OK\n";
    cout << "========================================\n";

    return 0;
}