#include "real_map_logic.h"
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <vector>
#include <string>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Route constructor
Route::Route() : totalDistance(0.0), estimatedDuration(0.0), estimatedFare(0.0), isValid(false) {}

// TripPhase constructor
TripPhase::TripPhase() : type(IDLE), assignedCabId(-1) {}

// RealMapCabSystem constructors
RealMapCabSystem::RealMapCabSystem(double speed) : currentTrip(), averageSpeed(speed) {}

// Add cabs to the system
void RealMapCabSystem::addCab(int id, Location position) {
    cabManager.addCab(id, position);
}

// Spawn cabs randomly around a center point
void RealMapCabSystem::spawnCabsAround(Location center, int count, double radiusMeters) {
    cabManager.reset();

    // Convert meters to degrees
    double metersPerDegreeLat = 111320.0;
    double metersPerDegreeLng = std::cos(center.latitude * M_PI / 180.0) * 111320.0;

    for (int i = 0; i < count; i++) {
        // Generate random position within radius
        double angle = (std::rand() % 360) * M_PI / 180.0;
        double distance = (std::rand() % (int)radiusMeters);

        double latOffset = (distance * std::cos(angle)) / metersPerDegreeLat;
        double lngOffset = (distance * std::sin(angle)) / metersPerDegreeLng;

        Location cabPos(center.latitude + latOffset, center.longitude + lngOffset);
        addCab(i + 1, cabPos);
    }
}

// Calculate straight-line distance between two points (in meters)
double RealMapCabSystem::calculateDistance(Location a, Location b) {
    return CabManager::distanceMeters(a, b);
}

// Find nearest available cab to pickup location
int RealMapCabSystem::findNearestCab(Location pickup) {
    return cabManager.findNearestAvailable(pickup);
}

// Calculate fare based on distance (in km) and time (in minutes)
double RealMapCabSystem::calculateFare(double distanceKm, double durationMinutes) {
    const double BASE_FARE = 2.50;       // Base fare in currency units
    const double PER_KM_RATE = 1.20;     // Rate per kilometer
    const double PER_MINUTE_RATE = 0.20; // Rate per minute
    const double MINIMUM_FARE = 5.00;    // Minimum fare

    double distanceFare = distanceKm * PER_KM_RATE;
    double timeFare = durationMinutes * PER_MINUTE_RATE;
    double totalFare = BASE_FARE + distanceFare + timeFare;

    return std::max(totalFare, MINIMUM_FARE);
}

// Estimate route distance, duration, and fare (simplified - assumes road network factor is 1.3x straight line)
Route RealMapCabSystem::estimateRoute(Location from, Location to) {
    Route route;
    route.waypoints = {from, to};

    double straightDistance = calculateDistance(from, to);
    route.totalDistance = straightDistance * 1.3; // Road distance factor
    route.estimatedDuration = (averageSpeed > 0) ? (route.totalDistance / averageSpeed) : 0.0;
    route.estimatedFare = calculateFare(route.totalDistance / 1000.0, route.estimatedDuration / 60.0);
    route.isValid = true;

    return route;
}

// Start a new trip
bool RealMapCabSystem::startTrip(Location pickup) {
    if (currentTrip.type != TripPhase::IDLE) return false;

    int cabId = findNearestCab(pickup);
    if (cabId == -1) return false;

    // Find the cab object
    Cab assignedCab;
    if (!cabManager.getCab(cabId, assignedCab)) return false;

    // Set up trip
    currentTrip.type = TripPhase::CAB_TO_PICKUP;
    currentTrip.pickup = pickup;
    currentTrip.assignedCabId = cabId;
    currentTrip.currentRoute = estimateRoute(assignedCab.position, pickup);

    // Mark cab as unavailable
    cabManager.setAvailability(cabId, false);

    return true;
}

// Add drop location to existing trip
bool RealMapCabSystem::addDropLocation(Location drop) {
    if (currentTrip.type != TripPhase::CAB_TO_PICKUP) return false;

    currentTrip.drop = drop;
    currentTrip.type = TripPhase::PICKUP_TO_DROP;
    currentTrip.currentRoute = estimateRoute(currentTrip.pickup, drop);

    return true;
}

// Complete the trip
void RealMapCabSystem::completeTrip() {
    if (currentTrip.assignedCabId != -1) {
        // Mark cab as available again and update its position
        cabManager.setAvailability(currentTrip.assignedCabId, true);
        Location newPos = (currentTrip.type == TripPhase::PICKUP_TO_DROP) ? currentTrip.drop : currentTrip.pickup;
        cabManager.updatePosition(currentTrip.assignedCabId, newPos);
    }

    currentTrip = TripPhase(); // Reset trip
}

// Get current trip information
TripPhase RealMapCabSystem::getCurrentTrip() const {
    return currentTrip;
}

// Get all cabs
std::vector<Cab> RealMapCabSystem::getCabs() const {
    return cabManager.listCabs();
}

// Get available cabs count
int RealMapCabSystem::getAvailableCabsCount() const {
    return cabManager.countAvailable();
}

// Reset the system
void RealMapCabSystem::reset() {
    cabManager.reset();
    currentTrip = TripPhase();
}

// Format time duration
std::string RealMapCabSystem::formatDuration(double seconds) {
    int totalMinutes = static_cast<int>(seconds / 60);
    int hours = totalMinutes / 60;
    int minutes = totalMinutes % 60;

    if (hours > 0) {
        return std::to_string(hours) + "h " + std::to_string(minutes) + "m";
    } else {
        return std::to_string(minutes) + "m";
    }
}

// Format distance
std::string RealMapCabSystem::formatDistance(double meters) {
    if (meters >= 1000) {
        double km = std::round(meters / 100.0) / 10.0;
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.1f km", km);
        return std::string(buf);
    } else {
        return std::to_string(static_cast<int>(meters)) + " m";
    }
}

// Format currency
std::string RealMapCabSystem::formatCurrency(double amount) {
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "$%.2f", amount);
    return std::string(buffer);
}

#ifdef REAL_MAP_DEMO
int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    RealMapCabSystem system;
    Location delhi(28.6139, 77.2090);

    std::cout << "=== Real Map Cab System Demo ===\n";
    system.spawnCabsAround(delhi, 5, 2000);
    std::cout << "Spawned " << system.getCabs().size() << " cabs around Delhi\n";

    for (const auto& cab : system.getCabs()) {
        std::cout << "Cab #" << cab.id << ": (" << cab.position.latitude << ", "
                  << cab.position.longitude << ")\n";
    }

    Location pickup(28.6315, 77.2167);
    std::cout << "\nSetting pickup at Connaught Place...\n";

    if (system.startTrip(pickup)) {
        TripPhase trip = system.getCurrentTrip();
        std::cout << "Trip started! Assigned cab: #" << trip.assignedCabId << "\n";
        std::cout << "Distance: " << system.formatDistance(trip.currentRoute.totalDistance) << "\n";
        std::cout << "Estimated time: " << system.formatDuration(trip.currentRoute.estimatedDuration) << "\n";

        Location drop(28.6129, 77.2295);
        std::cout << "\nAdding drop location at India Gate...\n";
        if (system.addDropLocation(drop)) {
            trip = system.getCurrentTrip();
            std::cout << "Drop location confirmed!\n";
            std::cout << "Trip distance: " << system.formatDistance(trip.currentRoute.totalDistance) << "\n";
            std::cout << "Estimated time: " << system.formatDuration(trip.currentRoute.estimatedDuration) << "\n";
        }

        system.completeTrip();
        std::cout << "\nTrip completed. Available cabs: " << system.getAvailableCabsCount() << "\n";
    }

    return 0;
}
#endif
