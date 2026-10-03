(function(){
    const OSRM = 'https://router.project-osrm.org';
    const profile = 'driving';
    const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
    const OVERPASS = 'https://overpass-api.de/api/interpreter';

    // =========================================================================
    // REALISTIC URBAN SPEED & ETA CONFIGURATION
    // =========================================================================
    // Configurable realistic urban city cab average speed in km/h (22.0 - 25.0 km/h)
    // Benchmark expected travel times:
    //   - ~5 km  -> ~12.5 mins (benchmark range: 12-14 mins)
    //   - ~9 km  -> ~22.5 mins (benchmark range: 22-25 mins)
    //   - ~15 km -> ~37.5 mins (benchmark range: 36-41 mins)
    const DEFAULT_URBAN_SPEED_KMH = 24.0;

    // Maximum realistic urban cab speed threshold in km/h.
    // Routing engines (e.g. OSRM free-flow speed limits) often report speeds of 40-50 km/h
    // which are too optimistic for real-world city cab simulations with traffic & signals.
    // If the routing engine duration implies a speed > 35 km/h, the system falls back
    // to the realistic urban speed model to prevent unrealistic ETAs.
    const MAX_REALISTIC_URBAN_SPEED_KMH = 35.0;

    // Minimum realistic urban cab speed threshold in km/h (crawling traffic lower bound)
    const MIN_REALISTIC_URBAN_SPEED_KMH = 5.0;

    // Minimum trip duration in minutes (prevents zero, negative, or absurdly small durations)
    const MIN_TRIP_DURATION_MINUTES = 1.0;

    /**
     * Calculates realistic travel duration in minutes from routed road distance and optional route engine output.
     * 
     * @param {number} distanceMeters - Actual road-route distance in meters.
     * @param {number|null|undefined} routeDurationSeconds - Raw duration returned by routing engine in seconds.
     * @returns {{ durationMinutes: number, source: string, speedKmh: number, distanceKm: number }}
     * 
     * Decision Flow:
     * 1. Uses the actual routed road distance (distanceMeters).
     * 2. Converts distance to kilometers: distanceKm = distanceMeters / 1000.
     * 3. Checks if the routing engine provided a valid duration in seconds:
     *    - Calculates implied speed: speedKmh = distanceKm / (durationSeconds / 3600).
     *    - If speed is within realistic urban limits (5.0 <= speed <= 35.0 km/h),
     *      prefers and directly uses the routing engine duration.
     *    - If implied speed is unrealistically high (> 35.0 km/h, e.g. 41.5 km/h for a 9 km trip)
     *      or below 5 km/h, flags it as unrealistic and falls back to DEFAULT_URBAN_SPEED_KMH.
     * 4. If routing engine duration is missing or unavailable, calculates travel time directly:
     *    durationMinutes = (distanceKm / DEFAULT_URBAN_SPEED_KMH) * 60.
     * 5. Enforces MIN_TRIP_DURATION_MINUTES floor to prevent zero, negative, or NaN values.
     */
    function calculateRealisticDuration(distanceMeters, routeDurationSeconds) {
        const safeDistanceMeters = (typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters > 0)
            ? distanceMeters
            : 0;
        const distanceKm = safeDistanceMeters / 1000.0;

        if (distanceKm < 0.01) {
            return {
                durationMinutes: MIN_TRIP_DURATION_MINUTES,
                source: 'minimum_floor',
                speedKmh: DEFAULT_URBAN_SPEED_KMH,
                distanceKm: 0
            };
        }

        let durationMinutes = 0;
        let source = '';
        let effectiveSpeedKmh = DEFAULT_URBAN_SPEED_KMH;

        const hasValidEngineDuration = (
            typeof routeDurationSeconds === 'number' &&
            Number.isFinite(routeDurationSeconds) &&
            routeDurationSeconds > 0
        );

        if (hasValidEngineDuration) {
            const rawEngineMinutes = routeDurationSeconds / 60.0;
            const impliedSpeedKmh = distanceKm / (routeDurationSeconds / 3600.0);

            if (impliedSpeedKmh <= MAX_REALISTIC_URBAN_SPEED_KMH && impliedSpeedKmh >= MIN_REALISTIC_URBAN_SPEED_KMH) {
                // Route-engine duration is within realistic urban speed limits -> use directly
                durationMinutes = rawEngineMinutes;
                source = 'routing_engine';
                effectiveSpeedKmh = impliedSpeedKmh;
            } else {
                // Overly optimistic free-flow speed (>35 km/h) or extreme crawl -> fallback to urban speed model
                durationMinutes = (distanceKm / DEFAULT_URBAN_SPEED_KMH) * 60.0;
                source = 'fallback_urban_speed_clamped';
                effectiveSpeedKmh = DEFAULT_URBAN_SPEED_KMH;
            }
        } else {
            // Routing engine duration unavailable -> calculate from road distance using urban speed model
            durationMinutes = (distanceKm / DEFAULT_URBAN_SPEED_KMH) * 60.0;
            source = 'fallback_urban_speed';
            effectiveSpeedKmh = DEFAULT_URBAN_SPEED_KMH;
        }

        // Enforce duration floor and format cleanly
        const finalMinutes = Math.max(MIN_TRIP_DURATION_MINUTES, durationMinutes);

        return {
            durationMinutes: Math.round(finalMinutes * 10) / 10,
            source: source,
            speedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
            distanceKm: Math.round(distanceKm * 100) / 100
        };
    }

    function setInfo(msg){
        document.getElementById('lfInfo').textContent = msg;
    }

    function iconHtml(cls){
        return L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [14,14], iconAnchor: [7,7] });
    }

    const map = L.map('map').setView([28.6139, 77.2090], 12); // Default center: New Delhi
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let pickupMarker = null;
    let dropMarker = null;
    let cabMarkers = [];
    let cabCoords = []; // [ [latitude, longitude], ... ]
    // Two distinct route layers: cab->pickup and pickup->drop
    let routeCabPickupLayer = L.geoJSON(null, { style: { color: '#f59e0b', weight: 5, opacity: 0.95 } }).addTo(map); // amber
    let routePickupDropLayer = L.geoJSON(null, { style: { color: '#22c55e', weight: 5, opacity: 0.95 } }).addTo(map); // green
    let animMarker = null;
    let animCoords = [];
    let animIdx = 0;
    let animHandle = null;

    function resetAll(keepPickup = false){
        if (dropMarker) { map.removeLayer(dropMarker); dropMarker = null; }
        routeCabPickupLayer.clearLayers();
        routePickupDropLayer.clearLayers();
        cabMarkers.forEach(m => map.removeLayer(m));
        cabMarkers = [];
        cabCoords = [];
        stopAnim();
        
        if (!keepPickup && pickupMarker) {
            map.removeLayer(pickupMarker);
            pickupMarker = null;
            setInfo('Click on map to set pickup.');
            setTrip({ status: 'Idle', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–', fare: undefined });
        } else if (pickupMarker) {
            setInfo('Click on map to set drop location (optional).');
        }
    }

    function stopAnim(){
        if (animHandle) cancelAnimationFrame(animHandle);
        animHandle = null;
        if (animMarker) { map.removeLayer(animMarker); animMarker = null; }
        animCoords = [];
        animIdx = 0;
    }

    async function osrmTable(coords){
        try {
            // coordinates: [[latitude,longitude], ...]
            const locs = coords.map(c => `${c[1]},${c[0]}`).join(';');
            const url = `${OSRM}/table/v1/${profile}/${locs}?annotations=distance`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('OSRM table failed');
            return await res.json();
        } catch (err) {
            console.warn('osrmTable call failed, using straight-line distance fallback:', err);
            const n = coords.length;
            const distances = [];
            for (let i = 0; i < n; i++) {
                distances[i] = [];
                for (let j = 0; j < n; j++) {
                    distances[i][j] = map.distance(coords[i], coords[j]) * 1.3;
                }
            }
            return { distances };
        }
    }

    async function osrmRoute(a, b){
        try {
            const locs = `${a[1]},${a[0]};${b[1]},${b[0]}`;
            const url = `${OSRM}/route/v1/${profile}/${locs}?overview=full&geometries=geojson&alternatives=false&steps=false&annotations=false`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('OSRM route failed');
            return await res.json();
        } catch (err) {
            console.warn('osrmRoute call failed, using road-factored geometric fallback:', err);
            const straightMeters = map.distance(a, b);
            const roadMeters = straightMeters * 1.3; // 1.3x road network factor
            return {
                routes: [{
                    distance: roadMeters,
                    duration: null, // Routing engine duration unavailable
                    geometry: {
                        type: 'LineString',
                        coordinates: [[a[1], a[0]], [b[1], b[0]]]
                    }
                }]
            };
        }
    }

    async function fetchMainRoadPolylines(center, radiusMeters){
        const [lat, lon] = center;
        const query = `[
            out:json
        ];
        (
          way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](around:${Math.round(radiusMeters)},${lat},${lon});
        );
        out geom;`;
        const res = await fetch(OVERPASS, { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } });
        if (!res.ok) throw new Error('Overpass request failed');
        const data = await res.json();
        return (data.elements || []).filter(e => e.type === 'way' && Array.isArray(e.geometry)).map(e => e.geometry.map(p => [p.lat, p.lon]));
    }

    function samplePointsFromPolylines(polylines, count){
        const points = [];
        if (!polylines.length) return points;
        for (let i = 0; i < count; i++) {
            const way = polylines[Math.floor(Math.random() * polylines.length)];
            if (way.length < 2) { i--; continue; }
            const idx = Math.floor(Math.random() * (way.length - 1));
            const a = way[idx];
            const b = way[idx + 1];
            const t = Math.random();
            const lat = a[0] + (b[0] - a[0]) * t;
            const lng = a[1] + (b[1] - a[1]) * t;
            points.push([lat, lng]);
        }
        return points;
    }

    async function spawnNearbyCabs(center, count, radiusMeters){
        try {
            const polylines = await fetchMainRoadPolylines(center, radiusMeters);
            const pts = samplePointsFromPolylines(polylines, count);
            if (pts.length) {
                cabCoords = pts;
            } else {
                throw new Error('No main roads found');
            }
        } catch (e) {
            console.warn('Falling back to random spawn:', e.message || e);
            const lat = center[0];
            const lng = center[1];
            const metersPerDegLat = 111320;
            const metersPerDegLng = Math.cos(lat * Math.PI/180) * 111320;
            cabCoords = [];
            for (let i=0;i<count;i++){
                const r = Math.random() * radiusMeters;
                const theta = Math.random() * Math.PI * 2;
                const dx = (r * Math.cos(theta)) / metersPerDegLng;
                const dy = (r * Math.sin(theta)) / metersPerDegLat;
                cabCoords.push([lat + dy, lng + dx]);
            }
        }
        cabMarkers.forEach(m => map.removeLayer(m));
        cabMarkers = cabCoords.map(c => L.marker(c, { icon: iconHtml('marker-cab') }).addTo(map));
    }

    async function findNearestCabAndRoute(pick){
        if (cabCoords.length === 0) return null;
        // Build table with sources = cabs, destinations = pickup
        const coords = [...cabCoords, pick];
        const table = await osrmTable(coords);
        let best = { idx: -1, dist: Infinity };
        const pickupIdx = coords.length - 1;
        for (let i = 0; i < cabCoords.length; i++){
            const d = table.distances[i][pickupIdx];
            if (Number.isFinite(d) && d < best.dist) best = { idx: i, dist: d };
        }
        if (best.idx === -1) return null;
        const cab = cabCoords[best.idx];
        const r = await osrmRoute(cab, pick);
        const routeObj = (r && r.routes && r.routes[0]) ? r.routes[0] : null;

        // Prefer actual routed road distance over table distance where available
        const roadDistanceMeters = (routeObj && typeof routeObj.distance === 'number')
            ? routeObj.distance
            : best.dist;

        // Raw engine duration in seconds
        const engineDurationSeconds = (routeObj && typeof routeObj.duration === 'number')
            ? routeObj.duration
            : null;

        return {
            cabIndex: best.idx,
            cab,
            distance: roadDistanceMeters,
            duration: engineDurationSeconds,
            route: routeObj
        };
    }

    function drawCabPickupRoute(geojson){
        routeCabPickupLayer.clearLayers();
        routeCabPickupLayer.addData({ type: 'Feature', geometry: geojson.geometry, properties: {} });
        fitToAllRoutes();
    }

    function drawPickupDropRoute(geojson){
        routePickupDropLayer.clearLayers();
        routePickupDropLayer.addData({ type: 'Feature', geometry: geojson.geometry, properties: {} });
        fitToAllRoutes();
    }

    function fitToAllRoutes(){
        const layers = [];
        routeCabPickupLayer.eachLayer(l => layers.push(l));
        routePickupDropLayer.eachLayer(l => layers.push(l));
        if (layers.length === 0) return;
        let bounds = null;
        layers.forEach(l => {
            const b = l.getBounds();
            bounds = bounds ? bounds.extend(b) : b;
        });
        if (bounds) map.fitBounds(bounds.pad(0.2));
    }

    function animateAlong(geojson, startAt){
        stopAnim();
        if (!geojson || !geojson.geometry || !geojson.geometry.coordinates) return;
        const coords = geojson.geometry.coordinates.map(([x,y]) => [y,x]);
        if (coords.length < 2) return;
        animCoords = coords;
        animIdx = 0;
        animMarker = L.circleMarker(startAt, { radius: 6, color: '#111', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(map);
        const speedMps = (DEFAULT_URBAN_SPEED_KMH / 3.6); // Realistic animation traversal speed (~24 km/h = 6.67 m/s)
        function step(){
            if (animIdx >= animCoords.length - 1) return;
            const a = animCoords[animIdx];
            const b = animCoords[animIdx+1];
            const segDist = map.distance(a, b);
            const dt = 16 / 1000;
            const move = speedMps * dt;
            const t = Math.min(1, move / Math.max(1, segDist));
            const lat = a[0] + (b[0] - a[0]) * t;
            const lng = a[1] + (b[1] - a[1]) * t;
            animMarker.setLatLng([lat, lng]);
            if (t >= 1) animIdx++;
            animHandle = requestAnimationFrame(step);
        }
        animHandle = requestAnimationFrame(step);
    }

    // Default map view: New Delhi
    const defaultLocation = [28.6139, 77.2090];
    map.setView(defaultLocation, 14);
    
    // Function to initialize cabs
    const initializeCabs = async () => {
        try {
            const count = Math.max(1, Math.min(30, parseInt(document.getElementById('lfCabCount').value, 10) || 8));
            const radius = Math.max(100, Math.min(5000, parseInt(document.getElementById('lfRadius').value, 10) || 1200));
            await spawnNearbyCabs(defaultLocation, count, radius);
            
            const availableCabs = document.getElementById('availableCabs');
            availableCabs.textContent = `Click on map to set pickup location. ${count} cabs available.`;
        } catch (error) {
            console.error('Error initializing cabs:', error);
            const availableCabs = document.getElementById('availableCabs');
            availableCabs.textContent = 'Error loading cabs. Please refresh the page.';
            availableCabs.style.color = 'red';
        }
    };
    
    // Initialize cabs when page loads
    initializeCabs().catch(console.error);
    
    map.on('click', async (e) => {
        if (e.originalEvent && e.originalEvent.target && 
            (e.originalEvent.target.classList.contains('cab-marker') || 
             e.originalEvent.target.closest('.cab-marker'))) {
            return;
        }

        const dropEnabled = document.getElementById('lfDropToggle').checked;
        const count = Math.max(1, Math.min(30, parseInt(document.getElementById('lfCabCount').value, 10) || 8));
        const radius = Math.max(100, Math.min(5000, parseInt(document.getElementById('lfRadius').value, 10) || 1200));

        if (!pickupMarker) {
            // First click: Set Pickup location
            resetAll();
            pickupMarker = L.marker(e.latlng, { 
                icon: iconHtml('marker-pickup'),
                draggable: true
            }).addTo(map);
            
            // Allow dragging pickup marker to re-evaluate route dynamically
            pickupMarker.on('dragend', async function() {
                const newLatLng = pickupMarker.getLatLng();
                resetAll(true);
                setInfo('Finding nearest cab via roads...');
                try {
                    const best = await findNearestCabAndRoute([newLatLng.lat, newLatLng.lng]);
                    if (!best) {
                        setInfo('No available cabs near pickup location.');
                        return;
                    }
                    if (best.route) {
                        drawCabPickupRoute(best.route);
                        animateAlong(best.route, best.cab);
                    }
                    // Calculate realistic travel time and ETA using routed distance and engine output
                    const calc = calculateRealisticDuration(best.distance, best.duration);
                    const dKm = calc.distanceKm;
                    const mins = calc.durationMinutes;
                    const eta = addMinsToNow(mins);
                    const fare = calculateFare(dKm, mins);

                    setTrip({ 
                        status: 'En route to pickup', 
                        phase: 'Cab → Pickup', 
                        distance: formatKm(dKm), 
                        duration: formatMin(mins), 
                        now: nowString(), 
                        eta: eta,
                        fare: fare
                    });
                    setInfo(`Nearest cab: ${formatKm(dKm)}, ETA ${formatMin(mins)}. Estimated fare: ₹${fare}. Click drop (optional).`);
                } catch (err) {
                    console.error('Pickup drag error:', err);
                    setInfo('Routing service error. Try again.');
                }
            });
            
            await spawnNearbyCabs([e.latlng.lat, e.latlng.lng], count, radius);
            setInfo('Finding nearest cab via roads...');
            try {
                const best = await findNearestCabAndRoute([e.latlng.lat, e.latlng.lng]);
                if (!best) {
                    setInfo('No available cabs within range.');
                    setTrip({ status: 'No cabs available', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–', fare: 0 });
                    return;
                }
                if (best.route) {
                    drawCabPickupRoute(best.route);
                    animateAlong(best.route, best.cab);
                }

                // ETA & Duration Calculation:
                // Uses routed road distance (meters) and raw duration (seconds).
                // If engine duration is unrealistic (> 35 km/h), falls back to realistic urban speed model.
                const calc = calculateRealisticDuration(best.distance, best.duration);
                const dKm = calc.distanceKm;
                const mins = calc.durationMinutes;
                const eta = addMinsToNow(mins);
                const fare = calculateFare(dKm, mins);

                setTrip({ 
                    status: 'En route to pickup', 
                    phase: 'Cab → Pickup', 
                    distance: formatKm(dKm), 
                    duration: formatMin(mins), 
                    now: nowString(), 
                    eta: eta,
                    fare: fare
                });
                setInfo(`Nearest cab: ${formatKm(dKm)}, ETA ${formatMin(mins)}. Estimated fare: ₹${fare}. Click drop (optional).`);
            } catch (err){
                console.error('Pickup routing error:', err);
                setInfo('Routing service error. Try again.');
            }
        } else if (dropEnabled && !dropMarker) {
            // Second click (when drop enabled): Set Drop location and calculate onward trip
            dropMarker = L.marker(e.latlng, { icon: iconHtml('marker-drop') }).addTo(map);
            const pick = [pickupMarker.getLatLng().lat, pickupMarker.getLatLng().lng];
            const drop = [e.latlng.lat, e.latlng.lng];
            setInfo('Routing to destination drop...');
            try {
                const r = await osrmRoute(pick, drop);
                const routeObj = (r && r.routes && r.routes[0]) ? r.routes[0] : null;
                if (!routeObj) {
                    setInfo('Routing to drop failed.');
                    return;
                }
                drawPickupDropRoute(routeObj);
                animateAlong(routeObj, pick);

                // ETA & Duration Calculation for Pickup to Drop trip:
                // Uses actual road-route distance (meters) and engine duration (seconds) with urban speed fallback.
                const calc = calculateRealisticDuration(routeObj.distance, routeObj.duration);
                const dKm = calc.distanceKm;
                const durMin = calc.durationMinutes;
                const eta = addMinsToNow(durMin);
                const fare = calculateFare(dKm, durMin);

                setTrip({ 
                    status: 'En route to drop', 
                    phase: 'Pickup → Drop', 
                    distance: formatKm(dKm), 
                    duration: formatMin(durMin), 
                    now: nowString(), 
                    eta: eta,
                    fare: fare
                });
                setInfo(`Cab en route to destination. Distance: ${formatKm(dKm)}, Travel time: ${formatMin(durMin)}. Estimated fare: ₹${fare}`);
            } catch (err){
                console.error('Drop routing error:', err);
                setInfo('Routing service error.');
            }
        } else {
            // Subsequent click: Reset flow and start new pickup
            resetAll();
            pickupMarker = L.marker(e.latlng, { icon: iconHtml('marker-pickup') }).addTo(map);
            await spawnNearbyCabs([e.latlng.lat, e.latlng.lng], count, radius);
            setInfo('Finding nearest cab via roads...');
            try {
                const best = await findNearestCabAndRoute([e.latlng.lat, e.latlng.lng]);
                if (!best) {
                    setInfo('No available cabs within range.');
                    setTrip({ status: 'No cabs available', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–', fare: 0 });
                    return;
                }
                if (best.route) {
                    drawCabPickupRoute(best.route);
                    animateAlong(best.route, best.cab);
                }

                // ETA & Duration Calculation for new pickup
                const calc = calculateRealisticDuration(best.distance, best.duration);
                const dKm = calc.distanceKm;
                const mins = calc.durationMinutes;
                const eta = addMinsToNow(mins);
                const fare = calculateFare(dKm, mins);

                setTrip({ 
                    status: 'En route to pickup', 
                    phase: 'Cab → Pickup', 
                    distance: formatKm(dKm), 
                    duration: formatMin(mins), 
                    now: nowString(), 
                    eta: eta,
                    fare: fare
                });
                setInfo(`Nearest cab: ${formatKm(dKm)}, ETA ${formatMin(mins)}. Estimated fare: ₹${fare}. Click drop (optional).`);
            } catch (err){
                console.error('Reset routing error:', err);
                setInfo('Routing service error. Try again.');
            }
        }
    });

    document.getElementById('lfReset').addEventListener('click', () => resetAll(false));

    // Trip card formatting helpers
    function formatKm(km){ return `${km.toFixed(2)} km`; }
    function formatMin(min){ return `${min.toFixed(1)} min`; }
    function nowString(){
        const d = new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function addMinsToNow(mins){
        const d = new Date(Date.now() + mins * 60 * 1000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Formatting duration in seconds to HH:MM:SS
    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
    
    // Formatting distance in meters to km or m
    function formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        } else {
            return `${Math.round(meters)} m`;
        }
    }
    
    // Format currency
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    }

    // Calculating fare based on distance in km and duration in minutes (in INR)
    function calculateFare(distanceKm, durationMinutes) {
        const baseFare = 30;          // Base fare in INR
        const perKmRate = 12;         // Per kilometer rate in INR
        const perMinuteRate = 2;      // Per minute rate in INR
        const minimumFare = 50;       // Minimum fare in INR
        
        // Calculating fare components
        const distanceFare = distanceKm * perKmRate;
        const timeFare = durationMinutes * perMinuteRate;
        
        // Calculating total fare, ensuring it's not below minimum
        const totalFare = Math.max(baseFare + distanceFare + timeFare, minimumFare);
        
        return Math.round(totalFare);
    }
    
    function setTrip({ status, phase, distance, duration, now, eta, fare }) {
        if (status != null) document.getElementById('tdStatus').textContent = status;
        if (phase != null) document.getElementById('tdPhase').textContent = phase;
        if (distance != null) document.getElementById('tdDistance').textContent = distance;
        if (duration != null) document.getElementById('tdDuration').textContent = duration;
        if (now != null) document.getElementById('tdNow').textContent = now;
        if (eta != null) document.getElementById('tdEta').textContent = eta;
        
        if (fare !== undefined) {
            document.getElementById('tdFare').textContent = `₹${fare}`;
        }
    }

    // Initial sidebar values
    setTrip({ status: 'Idle', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–' });
})();
