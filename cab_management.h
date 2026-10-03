#pragma once
#include <bits/stdc++.h>
using namespace std;

struct Location {
    double latitude;
    double longitude;
    Location(double lat = 0.0, double lng = 0.0) : latitude(lat), longitude(lng) {}
};

struct Cab {
    int id;
    Location position;
    bool available;
    Cab(int cabId = -1, Location pos = Location(), bool a = true)
        : id(cabId), position(pos), available(a) {}
};

class CabManager {
private:
    vector<Cab> cabs;

    static double toRad(double deg) { return deg * M_PI / 180.0; }
    static double distanceMeters(const Location &a, const Location &b) {
        const double R = 6371000.0;
        double dLat = toRad(b.latitude - a.latitude);
        double dLng = toRad(b.longitude - a.longitude);
        double lat1 = toRad(a.latitude);
        double lat2 = toRad(b.latitude);
        double sinDLat = sin(dLat / 2.0);
        double sinDLng = sin(dLng / 2.0);
        double x = sinDLat * sinDLat + cos(lat1) * cos(lat2) * sinDLng * sinDLng;
        double c = 2.0 * atan2(sqrt(x), sqrt(1.0 - x));
        return R * c;
    }

public:
    bool addCab(int id, const Location &pos, bool available = true) {
        for (auto &c : cabs) if (c.id == id) return false;
        cabs.emplace_back(id, pos, available);
        return true;
    }

    bool removeCab(int id) {
        auto it = remove_if(cabs.begin(), cabs.end(), [&](const Cab &c){ return c.id == id; });
        if (it == cabs.end()) return false;
        cabs.erase(it, cabs.end());
        return true;
    }

    bool setAvailability(int id, bool available) {
        for (auto &c : cabs) if (c.id == id) { c.available = available; return true; }
        return false;
    }

    bool updatePosition(int id, const Location &pos) {
        for (auto &c : cabs) if (c.id == id) { c.position = pos; return true; }
        return false;
    }

    int findNearestAvailable(const Location &point) const {
        int bestId = -1;
        double bestDist = numeric_limits<double>::infinity();
        for (const auto &c : cabs) {
            if (!c.available) continue;
            double d = distanceMeters(point, c.position);
            if (d < bestDist) { bestDist = d; bestId = c.id; }
        }
        return bestId;
    }

    bool getCab(int id, Cab &out) const {
        for (const auto &c : cabs) if (c.id == id) { out = c; return true; }
        return false;
    }

    int count() const { return (int)cabs.size(); }

    int countAvailable() const {
        int k = 0; for (const auto &c : cabs) if (c.available) k++; return k;
    }

    vector<Cab> listCabs() const { return cabs; }

    void reset() { cabs.clear(); }
};
