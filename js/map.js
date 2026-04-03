// 1. Map Configurations
const mapConfigs = {
    'lvl1-south': { url: 'assets/floorplans/lvl1-south.png', bounds: [[0, 0], [1142, 2236]], center: [571, 1118], scale: 1.1 },
    'lvl1-north': { url: 'assets/floorplans/lvl1-north.png', bounds: [[0, 0], [1156, 2231]], center: [578, 1115], scale: 1.5 },
    'lvl2-social': { url: 'assets/floorplans/lvl2-social.png', bounds: [[0, 0], [1135, 2074]], center: [567.5, 1037], scale: 1.33 },
    'aggiecommons': { url: 'assets/floorplans/aggiecommons.png', bounds: [[0, 0], [996, 1498]], center: [498, 749], scale: 1.4 }
};

// 2. Initialize Leaflet Map
const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, attributionControl: false });

let currentImageOverlay;
let markerLayer = L.layerGroup().addTo(map);
let viewerInstance = null;

// 3. Switch Floor Plan logic
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();

    currentImageOverlay = L.imageOverlay(config.url, config.bounds);
    
    currentImageOverlay.on('load', function() {
        map.fitBounds(config.bounds);
        loadSavedMarkers(mapId);
    });

    currentImageOverlay.on('error', function() {
        console.error(`Failed to load image: ${config.url}`);
        alert(`Error: Floorplan image not found at ${config.url}. Please verify the file exists.`);
    });

    currentImageOverlay.addTo(map);

    if (typeof initEditor === 'function') initEditor(mapId, config.bounds);
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
                    [loc.y, loc.x], loc.orientation, loc.field_of_view, 
                    loc.title, loc.comments, loc.url, loc.type
                );
                marker.session_id = loc.session_id || Date.now() + Math.random(); 
                marker.addTo(markerLayer);
            });
        })
        .catch(error => console.warn('Notice: Marker load skipped or failed.', error));
}

// 5. Marker Generator & Interactions
function createDirectionalMarker(latlng, angle, fov, title, comments, url, type) {
    const dotColor = type === 'panorama' ? '#28a745' : '#007bff';
    const marker = L.circleMarker(latlng, { radius: 6, color: '#ffffff', weight: 2, fillColor: dotColor, fillOpacity: 0.9 });
    let hoverPolygon = null;

    marker.on('mouseover', function() {
        if (fov > 0 && fov < 360) {
            const radius = 80; 
            const halfFov = fov / 2;
            const points = [latlng];
            for (let a = angle - halfFov; a <= angle + halfFov; a += 5) {
                const rad = a * Math.PI / 180;
                points.push([latlng[0] + radius * Math.cos(rad), latlng[1] + radius * Math.sin(rad)]);
            }
            hoverPolygon = L.polygon(points, { color: dotColor, weight: 0.5, fillColor: dotColor, fillOpacity: 0.05, interactive: false }).addTo(markerLayer);
        }
        marker.setRadius(8);
    });

    marker.on('mouseout', function() {
        if (hoverPolygon) { markerLayer.removeLayer(hoverPolygon); hoverPolygon = null; }
        marker.setRadius(6);
    });

    if (url) {
        const tooltipHtml = `<div style="text-align: center; max-width: 200px;"><img src="${url}" style="width: 100%; border-radius: 4px; margin-bottom: 5px;">${title ? `<b style="font-size:0.9em; display:block;">${title}</b>` : ''}</div>`;
        marker.bindTooltip(tooltipHtml, { direction: 'top', className: 'photo-tooltip' });
    }

    marker.on('click', () => {
        if (typeof isEditMode !== 'undefined' && isEditMode) {
            if (confirm(`Delete marker: ${title || 'Untitled'}?`)) {
                marker.remove();
                if (typeof sessionMarkers !== 'undefined' && marker.session_id) {
                    sessionMarkers = sessionMarkers.filter(m => m.session_id !== marker.session_id);
                    const countEl = document.getElementById('session-count');
                    if (countEl) countEl.textContent = sessionMarkers.length;
                }
            }
        } else {
            openPhotoViewer({ title, comments, url, type, fov });
        }
    });

    return marker;
}

// 6. Modal Photo Viewer
function openPhotoViewer(data) {
    const modal = document.getElementById('photo-modal');
    const container = document.getElementById('viewer-container');
    const titleElement = document.getElementById('modal-title');

    container.innerHTML = '';
    if (viewerInstance) { viewerInstance.destroy(); viewerInstance = null; }
    modal.classList.remove('modal-hidden');

    const displayTitle = data.title ? `<b>${data.title}</b>` : '';
    const displayComment = data.comments ? `<span style="font-weight:normal; font-style:italic; margin-left:15px; font-size:0.9em;">- ${data.comments}</span>` : '';
    const separator = (data.title && data.comments) ? ' ' : '';
    
    if (data.type === 'panorama') {
        viewerInstance = pannellum.viewer('viewer-container', {
            "type": "equirectangular", "panorama": data.url, "autoLoad": true,
            "haov": data.fov >= 360 ? 360 : data.fov, "minYaw": data.fov >= 360 ? -180 : -(data.fov / 2), "maxYaw": data.fov >= 360 ? 180 : (data.fov / 2),
            "hfov": 110, "maxHfov": 150, "vaov": 65
        });
        viewerInstance.on('zoomchange', (newHfov) => { titleElement.innerHTML = `${displayTitle}${separator}${displayComment} <span style="float:right; font-size:0.8em;">[HFOV: ${Math.round(newHfov)}]</span>`; });
        titleElement.innerHTML = `${displayTitle}${separator}${displayComment} <span style="float:right; font-size:0.8em;">[HFOV: 110]</span>`;
    } else {
        if (!data.title && !data.comments) titleElement.textContent = 'Photo View';
        else titleElement.innerHTML = `${displayTitle}${separator}${displayComment}`;
        
        const img = document.createElement('img');
        img.src = data.url;
        img.className = 'standard-img';
        img.onerror = () => container.innerHTML = `<p style="color:white; padding:20px;"><b>Error:</b> Image could not be loaded.</p>`;
        container.appendChild(img);
    }
}

// 7. Initialization
document.addEventListener('DOMContentLoaded', () => {
    const closeModalBtn = document.getElementById('close-modal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
        document.getElementById('photo-modal').classList.add('modal-hidden');
        if (viewerInstance) { viewerInstance.destroy(); viewerInstance = null; }
    });

    const mapSelector = document.getElementById('map-selector');
    if (mapSelector) mapSelector.addEventListener('change', (e) => switchMap(e.target.value));

    map.setView([0, 0], 0);
    switchMap('lvl1-south');
});