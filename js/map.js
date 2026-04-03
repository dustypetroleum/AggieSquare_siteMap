// 1. Map Configurations
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
    maxZoom: 3 
});

let currentImageOverlay;
let markerLayer = L.layerGroup().addTo(map);

// 3. Switch Floor Plan
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();

    currentImageOverlay = L.imageOverlay(config.url, config.bounds).addTo(map);
    map.fitBounds(config.bounds);

    if (typeof initEditor === 'function') initEditor(mapId, config.bounds);
    
    // Load the permanent markers for this floor
    loadSavedMarkers(mapId);
}

// 4. Fetch Saved Data
function loadSavedMarkers(mapId) {
    fetch('data/locations.json')
        .then(response => {
            if (!response.ok) throw new Error("No data file found.");
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
        .catch(error => console.log('Notice: No saved points loaded yet.', error));
}

// 5. Marker & Popup Logic
let viewerInstance = null;

function createDirectionalMarker(latlng, angle, fov, title, comments, url, type) {
    const marker = L.circleMarker(latlng, { 
        radius: 6, 
        color: '#ffffff', 
        weight: 2, 
        fillColor: '#007bff', 
        fillOpacity: 0.9 
    });
    
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <b style="font-size:1.1em;">${title || 'Untitled'}</b><br>
        <i>${comments || 'No comments'}</i><br>
        <hr style="margin:5px 0; border:0; border-top:1px solid #ccc;">
        Facing: ${angle}° (FOV: ${fov}°)<br>
        <button class="view-photo-btn" style="background: #28a745; color: white; border: none; margin-top: 8px; cursor: pointer; padding: 6px 12px; border-radius: 4px; width: 100%;">View Photo</button>
        <button class="delete-marker-btn" style="background: #dc3545; color: white; border: none; margin-top: 5px; cursor: pointer; padding: 6px 12px; border-radius: 4px; width: 100%;">Delete Point</button>
    `;

    marker.bindPopup(popupContent);

    marker.on('popupopen', () => {
        const delBtn = popupContent.querySelector('.delete-marker-btn');
        const viewBtn = popupContent.querySelector('.view-photo-btn');
        
        if (typeof isEditMode !== 'undefined' && !isEditMode) {
            delBtn.style.display = 'none';
        } else {
            delBtn.style.display = 'block';
            delBtn.onclick = () => {
                if (confirm(`Delete marker: ${title}?`)) {
                    marker.remove(); 
                    if (typeof sessionMarkers !== 'undefined' && marker.session_id) {
                        sessionMarkers = sessionMarkers.filter(m => m.session_id !== marker.session_id);
                        document.getElementById('session-count').textContent = sessionMarkers.length;
                    }
                }
            };
        }

        viewBtn.onclick = () => {
            openPhotoViewer({ title, url, type, fov });
        };
    });

    return marker;
}

// 6. Modal & Viewer Rendering
function openPhotoViewer(data) {
    const modal = document.getElementById('photo-modal');
    const container = document.getElementById('viewer-container');
    document.getElementById('modal-title').textContent = data.title || 'Photo View';

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
            "maxYaw": data.fov >= 360 ? 180 : (data.fov / 2)
        });
    } else {
        const img = document.createElement('img');
        img.src = data.url;
        img.className = 'standard-img';
        img.alt = data.title;
        container.appendChild(img);
    }
}

// 7. Event Listeners & Initialization
document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('photo-modal').classList.add('modal-hidden');
    if (viewerInstance) {
        viewerInstance.destroy();
        viewerInstance = null;
    }
});

document.getElementById('map-selector').addEventListener('change', (e) => switchMap(e.target.value));
switchMap('lvl1-south');