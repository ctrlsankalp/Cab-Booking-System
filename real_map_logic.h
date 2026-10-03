#ifndef REAL_MAP_LOGIC_H
#define REAL_MAP_LOGIC_H

#include <vector>
#include <string>
#include "cab_management.h"

struct Route {
    std::vector<Location> waypoints;
    double totalDistance;      // Distance in meters
    double estimatedDuration;   // Duration in seconds
    double estimatedFare;       // Estimated fare amount
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
    double averageSpeed; // meters per second (default 18.0 m/s ~ 65 km/h)

public:
    explicit RealMapCabSystem(double speed = 18.0);

    // Fleet management
    void addCab(int id, Location position);
    void spawnCabsAround(Location center, int count, double radiusMeters);

    // Routing and distances
    double calculateDistance(Location a, Location b);
    int findNearestCab(Location pickup);
    double calculateFare(double distanceKm, double durationMinutes);
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
