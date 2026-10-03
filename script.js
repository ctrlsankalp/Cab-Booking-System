(function(){
    const OSRM = 'https://router.project-osrm.org';
    const profile = 'driving';
    const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
    const OVERPASS = 'https://overpass-api.de/api/interpreter';

    function setInfo(msg){
        document.getElementById('lfInfo').textContent = msg;
    }

    function iconHtml(cls){
        return L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [14,14], iconAnchor: [7,7] });
    }

    const map = L.map('map').setView([28.6139, 77.2090], 12); //  by default New Delhi
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
        const currentPickup = keepPickup ? pickupMarker : null;
        
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
            setTrip({ status: 'Idle', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–' });
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
        // coordinates: [[latitude,longitude], ...]
        const locs = coords.map(c => `${c[1]},${c[0]}`).join(';');
        const url = `${OSRM}/table/v1/${profile}/${locs}?annotations=distance`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM table failed');
        return res.json();
    }

    async function osrmRoute(a, b){
        const locs = `${a[1]},${a[0]};${b[1]},${b[0]}`;
        const url = `${OSRM}/route/v1/${profile}/${locs}?overview=full&geometries=geojson&alternatives=false&steps=false&annotations=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM route failed');
        return res.json();
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
        // Returning array of polylines, each polyline is [[latitude,longitude], ...]
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
            // Fallback: random around
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
        // distances is NxN; we care rows 0..cabs-1 to last column (pickup)
        let best = { idx: -1, dist: Infinity };
        const pickupIdx = coords.length - 1;
        for (let i=0;i<cabCoords.length;i++){
            const d = table.distances[i][pickupIdx];
            if (Number.isFinite(d) && d < best.dist) best = { idx: i, dist: d };
        }
        if (best.idx === -1) return null;
        const cab = cabCoords[best.idx];
        const r = await osrmRoute(cab, pick);
        return { cabIndex: best.idx, cab, distance: best.dist, duration: r.routes[0].duration, route: r.routes[0] };
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
        const coords = geojson.geometry.coordinates.map(([x,y]) => [y,x]);
        animCoords = coords;
        animIdx = 0;
        animMarker = L.circleMarker(startAt, { radius: 6, color: '#111', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(map);
        const speedMps = 18; // ~65 km/h
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
    // Setting up default map view to New Delhi
    const defaultLocation = [28.6139, 77.2090];
    map.setView(defaultLocation, 14);
    
    // Function to initialize cabs
    const initializeCabs = async () => {
        try {
            const count = Math.max(1, Math.min(30, parseInt(document.getElementById('lfCabCount').value, 10) || 8));
            const radius = Math.max(100, Math.min(5000, parseInt(document.getElementById('lfRadius').value, 10) || 1200));
            await spawnNearbyCabs(defaultLocation, count, radius);
            
            // Showing available cabs info
            const availableCabs = document.getElementById('availableCabs');
            availableCabs.textContent = `Click on map to set pickup location. ${count} cabs available.`;
        } catch (error) {
            console.error('Error initializing cabs:', error);
            const availableCabs = document.getElementById('availableCabs');
            availableCabs.textContent = 'Error loading cabs. Please refresh the page.';
            availableCabs.style.color = 'red';
        }
    };
    
    // Initializing cabs when the page loads
    initializeCabs().catch(console.error);
    
    map.on('click', async (e) => {
        // Not doing anything if the click was on a cab marker
        if (e.originalEvent && e.originalEvent.target && 
            (e.originalEvent.target.classList.contains('cab-marker') || 
             e.originalEvent.target.closest('.cab-marker'))) {
            return;
        }

        const dropEnabled = document.getElementById('lfDropToggle').checked;
        const count = Math.max(1, Math.min(30, parseInt(document.getElementById('lfCabCount').value,10)||8));
        const radius = Math.max(100, Math.min(5000, parseInt(document.getElementById('lfRadius').value,10)||1200));

        if (!pickupMarker) {
            // Clear up existing markers and routes first, but keep pickup if it exists
            resetAll();
            // Setting new pickup marker
            pickupMarker = L.marker(e.latlng, { 
                icon: iconHtml('marker-pickup'),
                draggable: true
            }).addTo(map);
            
            // Updating pickup location if marker is dragged
            pickupMarker.on('dragend', function() {
                const newLatLng = pickupMarker.getLatLng();
                resetAll(true);
                findNearestCabAndRoute([newLatLng.lat, newLatLng.lng]);
            });
            
            await spawnNearbyCabs([e.latlng.lat, e.latlng.lng], count, radius);
            setInfo('Finding nearest cab via roads...');
            try {
                const best = await findNearestCabAndRoute([e.latlng.lat, e.latlng.lng]);
                if (!best) { setInfo('No reachable cab.'); return; }
                drawCabPickupRoute(best.route);
                animateAlong(best.route, best.cab);
                const dKm = (best.distance/1000);
                const mins = Math.max(1, Math.ceil(best.duration/60));
                const eta = addMinsToNow(mins);
                const fare = calculateFare(dKm, mins);
                setTrip({ 
                    status: 'En route to pickup', 
                    phase: 'Cab → Pickup', 
                    distance: formatKm(dKm), 
                    duration: formatMin(mins), 
                    now: nowString(), 
                    eta,
                    fare: fare
                });
                setInfo(`Nearest cab: ${formatKm(dKm)}, ETA ${formatMin(mins)}. Estimated fare: ₹${fare}. Click drop (optional).`);
            } catch (err){
                console.error(err);
                setInfo('Routing service error. Try again.');
            }
        } else if (dropEnabled && !dropMarker) {
            dropMarker = L.marker(e.latlng, { icon: iconHtml('marker-drop') }).addTo(map);
            // Route from pickup to drop
            const pick = [pickupMarker.getLatLng().lat, pickupMarker.getLatLng().lng];
            const drop = [e.latlng.lat, e.latlng.lng];
            setInfo('Routing to drop...');
            try {
                const r = await osrmRoute(pick, drop);
                drawPickupDropRoute(r.routes[0]);
                animateAlong(r.routes[0], pick);
                const dKm = (r.routes[0].distance/1000);
                const durMin = (r.routes[0].duration/60);
                const fare = calculateFare(dKm, durMin);
                setTrip({ 
                    status: 'En route to drop', 
                    phase: 'Pickup → Drop', 
                    distance: formatKm(dKm), 
                    duration: formatMin(durMin), 
                    now: nowString(), 
                    eta: addMinsToNow(durMin),
                    fare: fare
                });
                setInfo(`Cab is on the way to drop location. Estimated fare: ₹${fare}`);
            } catch (err){
                console.error(err);
                setInfo('Routing service error.');
            }
        } else {
            // Reset flow
            resetAll();
            pickupMarker = L.marker(e.latlng, { icon: iconHtml('marker-pickup') }).addTo(map);
            await spawnNearbyCabs([e.latlng.lat, e.latlng.lng], count, radius);
            setInfo('Finding nearest cab via roads...');
            try {
                const best = await findNearestCabAndRoute([e.latlng.lat, e.latlng.lng]);
                if (!best) { setInfo('No reachable cab.'); return; }
                drawCabPickupRoute(best.route);
                animateAlong(best.route, best.cab);
                const dKm = (best.distance/1000);
                const mins = Math.max(1, Math.ceil(best.duration/60));
                setTrip({ 
                    status: 'En route to pickup', 
                    phase: 'Cab → Pickup', 
                    distance: formatKm(dKm), 
                    duration: formatMin(mins), 
                    now: nowString(), 
                    eta: addMinsToNow(mins) 
                });
                setInfo(`Nearest cab: ${formatKm(dKm)}, ETA ${formatMin(mins)}. Click drop (optional).`);
            } catch (err){
                console.error(err);
                setInfo('Routing service error. Try again.');
            }
        }
    });


    
    document.getElementById('lfReset').addEventListener('click', resetAll);


    // Trip card helpers
    function formatKm(km){ return `${km.toFixed(2)} km`; }
    function formatMin(min){ return `${min.toFixed(2)} min`; }
    function nowString(){
        const d = new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function addMinsToNow(mins){
        const d = new Date(Date.now() + mins*60*1000);
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
    
    // Formatting distance in meters to km or m depending on value
    function formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        } else {
            return    `${Math.round(meters)} m`;
        }
    }
    
    // Format currency
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }
    // Calculating fare based on distance in km and duration in minutes (in Indian Rupees)
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
        
        return Math.round(totalFare); // Returning rounded value to nearest rupee
    }
    
    // function setTrip({ status, phase, distance, duration, now, eta, fare }) {
    //     if (status != null) document.getElementById('tdStatus').textContent = status;
    //     if (phase != null) document.getElementById('tdPhase').textContent = phase;
    //     if (distance != null) document.getElementById('tdDistance').textContent = distance;
    //     if (duration != null) document.getElementById('tdDuration').textContent = duration;
    //     if (now != null) document.getElementById('tdNow').textContent = now;
    //     if (eta != null) document.getElementById('tdEta').textContent = eta;
        
    //     // Only updating fare if it's provided
    //     if (fare !== undefined) {
    //         document.getElementById('tdFare').textContent = ₹${fare};
    //     }
    // }
    function setTrip({ status, phase, distance, duration, now, eta, fare }) {
    if (status != null) document.getElementById('tdStatus').textContent = status;
    if (phase != null) document.getElementById('tdPhase').textContent = phase;
    if (distance != null) document.getElementById('tdDistance').textContent = distance;
    if (duration != null) document.getElementById('tdDuration').textContent = duration;
    if (now != null) document.getElementById('tdNow').textContent = now;
    if (eta != null) document.getElementById('tdEta').textContent = eta;
    
    // Only updating fare if it's provided
    if (fare !== undefined) {
        document.getElementById('tdFare').textContent = `₹${fare}`;
    }
}

// initial sidebar values
setTrip({ status: 'Idle', phase: '–', distance: '–', duration: '–', now: nowString(), eta: '–' });
})();
