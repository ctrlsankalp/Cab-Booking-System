#ifndef REAL_MAP_LOGIC_H
#define REAL_MAP_LOGIC_H

#include <vector>
#include <string>
#include "cab_management.h"

// =========================================================================
// URBAN SPEED & ETA CONFIGURATION CONSTANTS (km/h & seconds)
// =========================================================================
// Configurable realistic urban city average speed (22.0 - 25.0 km/h)
// 9 km -> ~22.5 mins | 5 km -> ~12.5 mins | 15 km -> ~37.5 mins
constexpr double DEFAULT_URBAN_SPEED_KMH = 24.0;

// Maximum realistic urban cab speed threshold in km/h.
// Any routing engine speed above this (e.g. 41.5 km/h from free-flow highway profiles)
// is recognized as unrealistic for dense city traffic and clamped to the realistic urban speed model.
constexpr double MAX_REALISTIC_URBAN_SPEED_KMH = 35.0;

// Minimum realistic urban cab speed threshold in km/h (heavy traffic lower bound)
constexpr double MIN_REALISTIC_URBAN_SPEED_KMH = 5.0;

// Minimum trip duration floor in seconds (1 minute = 60s to prevent 0, negative, or absurdly small durations)
constexpr double MIN_TRIP_DURATION_SECONDS = 60.0;

struct Route {
    std::vector<Location> waypoints;
    double totalDistance;       // Distance in meters (actual road-route or road-factored distance)
    double estimatedDuration;    // Travel duration in seconds (calculated via realistic urban model)
    double estimatedFare;        // Estimated fare amount based on distance and duration
    bool isValid;

    Route();
};

struct TripPhase {
    enum Type { IDLE, CAB_TO_PICKUP, PICKUP_TO_DROP, COMPLETED };
    Type type;
    Location pickup;
    Location drop;
    int assignedCabId;
    Route currentRoute;

    TripPhase();
};

class RealMapCabSystem {
private:
    CabManager cabManager;
    TripPhase currentTrip;
    double averageSpeedKmh; // Configurable realistic urban speed in km/h (default: 24.0 km/h)

public:
    explicit RealMapCabSystem(double speedKmh = DEFAULT_URBAN_SPEED_KMH);

    // Fleet management
    void addCab(int id, Location position);
    void spawnCabsAround(Location center, int count, double radiusMeters);

    // Speed configuration
    void setAverageSpeedKmh(double speedKmh);
    double getAverageSpeedKmh() const;

    // Routing and distances
    double calculateDistance(Location a, Location b);
    int findNearestCab(Location pickup);
    double calculateFare(double distanceKm, double durationMinutes);

    // Realistic travel duration calculation:
    // - distanceMeters: actual routed road distance in meters
    // - routeDurationSeconds: raw duration from routing engine in seconds (-1 if unavailable)
    double calculateTravelDuration(double distanceMeters, double routeDurationSeconds = -1.0) const;

    Route estimateRoute(Location from, Location to);
    Route calculateRoute(Location from, Location to) { return estimateRoute(from, to); }

    // Core trip lifecycle
    bool startTrip(Location pickup);
    bool addDropLocation(Location drop);
    void completeTrip();

    // Query state
    TripPhase getCurrentTrip() const;
    std::vector<Cab> getCabs() const;
    int getAvailableCabsCount() const;

    void reset();

    // Utility formatting
    std::string formatDuration(double seconds);
    std::string formatDistance(double meters);
    std::string formatCurrency(double amount);
};

// MapManager alias to seamlessly resolve CabManager / MapManager mismatch
using MapManager = RealMapCabSystem;

#endif // REAL_MAP_LOGIC_H
