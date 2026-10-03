#include "cab_management.h"
#include <iostream>

#ifdef CAB_MANAGEMENT_DEMO
int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    CabManager mgr;
    mgr.addCab(1, Location(28.6139, 77.2090), true);
    mgr.addCab(2, Location(28.6353, 77.2250), true);
    mgr.addCab(3, Location(28.5500, 77.2500), false);

    int nearest = mgr.findNearestAvailable(Location(28.6315, 77.2167));
    std::cout << "Nearest available cab: " << nearest << "\n";

    mgr.setAvailability(2, false);
    std::cout << "Available count: " << mgr.countAvailable() << "\n";

    mgr.updatePosition(1, Location(28.6200, 77.2200));
    std::cout << "Nearest after move: " << mgr.findNearestAvailable(Location(28.6315, 77.2167)) << "\n";

    return 0;
}
#endif
