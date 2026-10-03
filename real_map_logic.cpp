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

// RealMapCabSystem constructors with configurable realistic urban average speed
RealMapCabSystem::RealMapCabSystem(double speedKmh)
    : currentTrip(),
      averageSpeedKmh((speedKmh > 0.0) ? speedKmh : DEFAULT_URBAN_SPEED_KMH) {}

void RealMapCabSystem::setAverageSpeedKmh(double speedKmh) {
    if (speedKmh > 0.0) {
        averageSpeedKmh = speedKmh;
    }
}

double RealMapCabSystem::getAverageSpeedKmh() const {
    return averageSpeedKmh;
}

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

// Calculate fare based on distance (in km) and duration (in minutes)
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

/**
 * Calculates realistic travel duration in seconds.
 * 
 * Units:
 *   - distanceMeters: meters (m)
 *   - routeDurationSeconds: seconds (s)
 *   - averageSpeedKmh: kilometers per hour (km/h)
 *   - output: seconds (s)
 * 
 * Decision logic:
 *   1. Converts distance to km: distanceKm = distanceMeters / 1000.0.
 *   2. If routeDurationSeconds is provided (> 0):
 *      - Computes implied speed: (distanceKm) / (routeDurationSeconds / 3600.0).
 *      - If speed is within realistic urban bounds (5.0 <= speed <= 35.0 km/h),
 *        prefers and uses routing engine duration directly.
 *      - If implied speed is impossibly high (> 35.0 km/h, such as raw free-flow highway
 *        assumptions of 41.5 km/h for dense urban centers) or too low (< 5.0 km/h),
 *        falls back to the realistic urban speed model (averageSpeedKmh, default 24.0 km/h).
 *   3. If routeDurationSeconds is missing/unavailable (<= 0):
 *      - Calculates duration via urban speed model: (distanceKm / averageSpeedKmh) * 3600.0 s.
 *   4. Enforces MIN_TRIP_DURATION_SECONDS floor (60s) to prevent 0 or negative values.
 */
double RealMapCabSystem::calculateTravelDuration(double distanceMeters, double routeDurationSeconds) const {
    double distanceKm = std::max(0.0, distanceMeters) / 1000.0;
    if (distanceKm < 0.01) {
        return MIN_TRIP_DURATION_SECONDS;
    }

    double durationSeconds = 0.0;

    // Check if routing engine duration is provided and realistic
    if (routeDurationSeconds > 0.0) {
        double impliedSpeedKmh = distanceKm / (routeDurationSeconds / 3600.0);
        if (impliedSpeedKmh >= MIN_REALISTIC_URBAN_SPEED_KMH && impliedSpeedKmh <= MAX_REALISTIC_URBAN_SPEED_KMH) {
            // Realistic engine duration -> prefer and use directly
            durationSeconds = routeDurationSeconds;
        } else {
            // Impossibly high speed (> 35 km/h) or crawl: fallback to realistic urban speed model
            durationSeconds = (distanceKm / averageSpeedKmh) * 3600.0;
        }
    } else {
        // Fallback realistic urban speed calculation: (distance_km / speed_kmh) * 3600 seconds
        durationSeconds = (distanceKm / averageSpeedKmh) * 3600.0;
    }

    return std::max(MIN_TRIP_DURATION_SECONDS, durationSeconds);
}

// Estimate route distance, duration, and fare using road distance factor and urban speed model
Route RealMapCabSystem::estimateRoute(Location from, Location to) {
    Route route;
    route.waypoints = {from, to};

    double straightDistance = calculateDistance(from, to);
    // Use road network winding factor (1.3x straight-line distance) when raw geometry is not loaded
    route.totalDistance = straightDistance * 1.3; 
    route.estimatedDuration = calculateTravelDuration(route.totalDistance);
    route.estimatedFare = calculateFare(route.totalDistance / 1000.0, route.estimatedDuration / 60.0);
    route.isValid = true;

    return route;
}

// Start a new trip
bool RealMapCabSystem::startTrip(Location pickup) {
    if (currentTrip.type != TripPhase::IDLE) return false;

    int cabId = findNearestCab(pickup);
    if (cabId == -1) return false;

    Cab assignedCab;
    if (!cabManager.getCab(cabId, assignedCab)) return false;

    currentTrip.type = TripPhase::CAB_TO_PICKUP;
    currentTrip.pickup = pickup;
    currentTrip.assignedCabId = cabId;
    currentTrip.currentRoute = estimateRoute(assignedCab.position, pickup);

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
        cabManager.setAvailability(currentTrip.assignedCabId, true);
        Location newPos = (currentTrip.type == TripPhase::PICKUP_TO_DROP) ? currentTrip.drop : currentTrip.pickup;
        cabManager.updatePosition(currentTrip.assignedCabId, newPos);
    }

    currentTrip = TripPhase();
}

TripPhase RealMapCabSystem::getCurrentTrip() const {
    return currentTrip;
}

std::vector<Cab> RealMapCabSystem::getCabs() const {
    return cabManager.listCabs();
}

int RealMapCabSystem::getAvailableCabsCount() const {
    return cabManager.countAvailable();
}

void RealMapCabSystem::reset() {
    cabManager.reset();
    currentTrip = TripPhase();
}

// Format time duration
std::string RealMapCabSystem::formatDuration(double seconds) {
    int totalMinutes = static_cast<int>(std::round(seconds / 60.0));
    int hours = totalMinutes / 60;
    int minutes = totalMinutes % 60;

    if (hours > 0) {
        return std::to_string(hours) + "h " + std::to_string(minutes) + "m";
    } else {
        return std::to_string(std::max(1, minutes)) + "m";
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
