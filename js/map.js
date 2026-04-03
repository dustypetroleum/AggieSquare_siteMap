// 1. Map Configurations
// Bounds are [Height, Width] in pixels.
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

// 2. Initialize Leaflet Map
const map = L.map('map', { 
    crs: L.CRS.Simple, 
    minZoom: -2, 
    maxZoom: 3,
    attributionControl: false
});

let currentImageOverlay;
let markerLayer = L.layerGroup().addTo(map);
let viewerInstance = null;

// 3. Switch Floor Plan logic
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    // 1. Clear existing layers
    if (currentImageOverlay) {
        map.removeLayer(currentImageOverlay);
    }
    markerLayer.clearLayers();

    // 2. Create and add new image overlay
    currentImageOverlay = L.imageOverlay(config.url, config.bounds);
    
    // 3. IMPORTANT: Once the image is ready, fit the map and THEN load markers.
    // This ensures markers are drawn on top of the image.
    currentImageOverlay.on('load', function() {
        map.fitBounds(config.bounds);
        loadSavedMarkers(mapId);
    });

    currentImageOverlay.addTo(map);

    if (typeof initEditor === 'function') {
        initEditor(mapId, config.bounds);
    }
}

// 4. Fetch and Load Saved Markers
function loadSavedMarkers(mapId) {
    fetch(`data/locations.json?t=${Date.now()}`)
        .then(response => {
            if (!response.ok) throw new Error("Data file not found.");
            return response.json();
        })
        .then(data => {
            const floorData = data.filter(item => item.map_id === mapId);
            
            floorData.forEach(loc => {
                const marker = createDirectionalMarker(
                    [loc.y, loc.x], 
                    loc.orientation, 
                    loc.field_of_view, 
                    loc.title,
                    loc.comments,
                    loc.url,
                    loc.type
                );
                
                marker.session_id = loc.session_id || Date.now() + Math.random(); 
                marker.addTo(markerLayer);
            });
        })
        .catch(error => console.warn('Notice: Marker load skipped or failed.', error));
}

// 5. Marker Generator & Popup Actions
function createDirectionalMarker(latlng, angle, fov, title, comments, url, type) {
    // 1. Create the base Circle Marker
    const marker = L.circleMarker(latlng, { 
        radius: 6, 
        color: '#ffffff', 
        weight: 2, 
        fillColor: '#007bff', 
        fillOpacity: 0.9 
    });

    let hoverPolygon = null;

// 2. Hover Event: Show Polygon
    marker.on('mouseover', function(e) {
        if (fov > 0 && fov < 360) {
            const radius = 60; 
            const halfFov = fov / 2;
            const points = [latlng];
            
            for (let a = angle - halfFov; a <= angle + halfFov; a += 5) {
                const rad = a * Math.PI / 180;
                points.push([
                    latlng[0] + radius * Math.cos(rad), 
                    latlng[1] + radius * Math.sin(rad)
                ]);
            }

            hoverPolygon = L.polygon(points, {
                color: '#007bff',
                weight: 1,
                fillColor: '#007bff',
                fillOpacity: 0.1, // Bumped slightly to 0.1 just to ensure we see it first
                interactive: false
            });
            
            // USE THE LAYER GROUP INSTEAD OF THE MAP
            hoverPolygon.addTo(markerLayer); 
        }
    });

    // 3. Mouse Out Event: Remove Polygon
    marker.on('mouseout', function() {
        if (hoverPolygon) {
            // REMOVE FROM THE LAYER GROUP
            markerLayer.removeLayer(hoverPolygon); 
            hoverPolygon = null;
        }
    });

    // 4. Popup Logic (Remains identical)
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <b style="font-size:1.1em;">${title || 'Untitled'}</b><br>
        <i>${comments || 'No comments'}</i><br>
        <hr style="margin:5px 0; border:0; border-top:1px solid #ccc;">
        <button class="view-photo-btn" style="background: #28a745; color: white; border: none; margin-top: 8px; cursor: pointer; padding: 6px 12px; border-radius: 4px; width: 100%;">View Photo</button>
        <button class="delete-marker-btn" style="background: #dc3545; color: white; border: none; margin-top: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; width: 100%;">Delete Point</button>
    `;

    marker.bindPopup(popupContent);
    marker.on('popupopen', () => {
        const delBtn = popupContent.querySelector('.delete-marker-btn');
        if (typeof isEditMode !== 'undefined' && !isEditMode) delBtn.style.display = 'none';
        popupContent.querySelector('.view-photo-btn').onclick = () => openPhotoViewer({ title, url, type, fov });
    });

    return marker;
}

// 6. Modal Photo Viewer logic
function openPhotoViewer(data) {
    const modal = document.getElementById('photo-modal');
    const container = document.getElementById('viewer-container');
    const titleElement = document.getElementById('modal-title');

    container.innerHTML = '';
    if (viewerInstance) {
        viewerInstance.destroy();
        viewerInstance = null;
    }

    modal.classList.remove('modal-hidden');

    if (data.type === 'panorama') {
        viewerInstance = pannellum.viewer('viewer-container', {
            "type": "equirectangular",
            "panorama": data.url,
            "autoLoad": true,
            "haov": data.fov >= 360 ? 360 : data.fov,
            "minYaw": data.fov >= 360 ? -180 : -(data.fov / 2),
            "maxYaw": data.fov >= 360 ? 180 : (data.fov / 2),
            "hfov": 110,
            "maxHfov": 150,
            "vaov": 65
        });

        viewerInstance.on('zoomchange', (newHfov) => {
            titleElement.textContent = `${data.title} | Current HFOV: ${Math.round(newHfov)}`;
        });
        
        titleElement.textContent = `${data.title} | Current HFOV: 110`;
    } else {
        titleElement.textContent = data.title || 'Photo View';
        const img = document.createElement('img');
        img.src = data.url;
        img.className = 'standard-img';
        img.alt = data.title;
        container.appendChild(img);
    }
}

// 7. Lifecycle Initialization
document.addEventListener('DOMContentLoaded', () => {
    const closeModalBtn = document.getElementById('close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('photo-modal').classList.add('modal-hidden');
            if (viewerInstance) {
                viewerInstance.destroy();
                viewerInstance = null;
            }
        });
    }

    const mapSelector = document.getElementById('map-selector');
    if (mapSelector) {
        mapSelector.addEventListener('change', (e) => switchMap(e.target.value));
    }

    // Set initial view and load first map
    map.setView([0, 0], 0);
    switchMap('lvl1-south');
});
