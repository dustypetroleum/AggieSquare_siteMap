// Map Configurations (Bounds are [height, width] in pixels)
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

// Initialize Map with Simple CRS
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 3
});

let currentImageOverlay;
let markerLayer = L.layerGroup().addTo(map);

// Switch Floor Plan
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();

    currentImageOverlay = L.imageOverlay(config.url, config.bounds).addTo(map);
    map.fitBounds(config.bounds);

    if (typeof initEditor === 'function') {
        initEditor(mapId, config.bounds);
    }
}

// Marker Generator with HTML Popup & Delete Logic
function createDirectionalMarker(latlng, angle, fov, title) {
    const marker = L.marker(latlng);
    
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <b>${title}</b><br>Facing: ${angle}° (FOV: ${fov}°)<br>
        <button class="delete-marker-btn" style="background: #dc3545; color: white; border: none; margin-top: 8px; cursor: pointer; padding: 6px 12px; border-radius: 4px; width: 100%;">Delete Point</button>
    `;

    marker.bindPopup(popupContent);

    marker.on('popupopen', () => {
        const delBtn = popupContent.querySelector('.delete-marker-btn');
        
        // Only show delete button in edit mode
        if (typeof isEditMode !== 'undefined' && !isEditMode) {
            delBtn.style.display = 'none';
        } else {
            delBtn.style.display = 'block';
            
            delBtn.onclick = () => {
                if (confirm(`Delete marker: ${title}?`)) {
                    marker.remove(); 
                    
                    // Remove from session array if it exists there
                    if (typeof sessionMarkers !== 'undefined' && marker.session_id) {
                        sessionMarkers = sessionMarkers.filter(m => m.session_id !== marker.session_id);
                        document.getElementById('session-count').textContent = sessionMarkers.length;
                    }
                }
            };
        }
    });

    return marker;
}

// Initial Load
document.getElementById('map-selector').addEventListener('change', (e) => switchMap(e.target.value));
switchMap('lvl1-south');