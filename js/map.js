// --- Configuration for the four provided maps ---
const mapConfigs = {
    'lvl1-south': {
        url: 'assets/floorplans/lvl1-south.png',
        bounds: [[0, 0], [1142, 2236]], 
        center: [571, 1118]
    },
    'lvl1-north': {
        url: 'assets/floorplans/lvl1-north.png',
        bounds: [[0, 0], [1156, 2231]],
        center: [578, 1115]
    },
    'lvl2-social': {
        url: 'assets/floorplans/lvl2-social.png',
        bounds: [[0, 0], [1135, 2074]],
        center: [567.5, 1037]
    },
    'aggiecommons': {
        url: 'assets/floorplans/aggiecommons.png',
        bounds: [[0, 0], [996, 1498]], 
        center: [498, 749]
    }
};

// 1. Initialize Map
const map = L.map('map', {
    crs: L.CRS.Simple, // Crucial for flat images
    minZoom: -1,
    maxZoom: 3
});

let currentImageOverlay;
let markerLayer = L.layerGroup().addTo(map); // Layer to hold clickable photo markers

// 2. Map Switching Function
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    // Clear previous elements
    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();

    // Add new floorplan
    currentImageOverlay = L.imageOverlay(config.url, config.bounds).addTo(map);
    map.fitBounds(config.bounds);

    // Initialize Edit mode (if defined in editor.js)
    if (typeof initEditor === 'function') {
        initEditor(mapId, config.bounds);
    }

    // Load markers (Mocked data for now, replace with actual fetch later)
    loadMockMarkers(mapId);
}

// 3. View Mode Functionality (Markers with FOV visualization)
function createDirectionalMarker(latlng, angle, fov, title) {
    // Basic standard marker for click detection
    const marker = L.marker(latlng);

    // Advanced Leaflet feature: SVG Field of View visualization
    // Requires specialized Leaflet plugins or custom JS (demonstrated here simply)
    // A simplified popup content is used for initial interaction:
    marker.bindPopup(`<b>${title}</b><br>Facing: ${angle}° (FOV: ${fov}°)`);

    return marker;
}

// Mock loader (Replace with fetch('data/locations.json') once JSON exists)
function loadMockMarkers(mapId) {
    markerLayer.clearLayers();
    if (mapId === 'lvl1-south') {
        createDirectionalMarker([600, 800], 90, 60, "South Entry Photo").addTo(markerLayer);
    }
}

// 4. Initial Load
document.getElementById('map-selector').addEventListener('change', (e) => switchMap(e.target.value));
switchMap('lvl1-south'); // Default map
