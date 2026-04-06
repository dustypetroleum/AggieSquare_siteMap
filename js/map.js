// 1. Map Configurations
const mapConfigs = {
    'overview': { url: 'assets/floorplans/aggiesquare_full.png', bounds: [[0, 0], [1169, 827]], center: [584.5, 413.5], scale: 1 },
    'lvl1-north': { url: 'assets/floorplans/lvl1-north.png', bounds: [[0, 0], [1156, 2231]], center: [578, 1115], scale: 1.5 },
    'lvl1-south': { url: 'assets/floorplans/lvl1-south.png', bounds: [[0, 0], [1142, 2236]], center: [571, 1118], scale: 1.1 },
    'aggiecommons': { url: 'assets/floorplans/aggiecommons.png', bounds: [[0, 0], [996, 1498]], center: [498, 749], scale: 1.4 },
    'lvl2-social': { url: 'assets/floorplans/lvl2-social.png', bounds: [[0, 0], [1135, 2074]], center: [567.5, 1037], scale: 1.33 }
};

// 2. Navigation Zones for Overview
const overviewZones = [
    { id: 'lvl1-north', bounds: [[1151, 13], [761, 681]], name: 'North Lobby' },
    { id: 'lvl1-south', bounds: [[765, 13], [402, 268]], name: 'South Lobby' },
    { id: 'aggiecommons', bounds: [[639, 176], [422, 563]], name: 'Aggie Commons' },
    { id: 'lvl2-social', bounds: [[384, 13], [28, 661]], name: 'Social Lab' }
];

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, attributionControl: false });
let currentImageOverlay, markerLayer = L.layerGroup().addTo(map), viewerInstance = null;

// 3. Switch Floor Plan
function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;

    const selector = document.getElementById('map-selector');
    if (selector && selector.value !== mapId) selector.value = mapId;

    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();

    currentImageOverlay = L.imageOverlay(config.url, config.bounds);
    currentImageOverlay.on('load', () => { 
        map.fitBounds(config.bounds); 
        if (mapId === 'overview') loadOverviewInteractivity();
        else loadSavedMarkers(mapId); 
    });
    currentImageOverlay.on('error', () => alert(`Error: Floorplan not found at ${config.url}`));
    currentImageOverlay.addTo(map);

    if (typeof initEditor === 'function') initEditor(mapId, config.bounds);
}

// 4. Overview Zones
function loadOverviewInteractivity() {
    overviewZones.forEach(zone => {
        const rect = L.rectangle(zone.bounds, { color: '#007bff', weight: 2, fillOpacity: 0.0, opacity: 0 }).addTo(markerLayer);
        rect.bindTooltip(`<b>${zone.name}</b><br>Click to view floorplan`, { direction: 'center', className: 'nav-tooltip' });
        rect.on('mouseover', () => rect.setStyle({ fillOpacity: 0.2, opacity: 1 }));
        rect.on('mouseout', () => rect.setStyle({ fillOpacity: 0.0, opacity: 0 }));
        rect.on('click', () => {
            const selector = document.getElementById('map-selector');
            if (selector) selector.value = zone.id;
            switchMap(zone.id);
        });
    });
}

// 5. Load Saved Data
function loadSavedMarkers(mapId) {
    fetch(`data/locations.json?t=${Date.now()}`)
        .then(res => { if (!res.ok) throw new Error("File not found."); return res.json(); })
        .then(data => {
            data.filter(item => item.map_id === mapId).forEach(loc => {
                if (loc.type === 'video_path') {
                    const path = createVideoPath([loc.y_start, loc.x_start], [loc.y_end, loc.x_end], loc.url, loc.title);
                    path.session_id = loc.session_id || Date.now() + Math.random();
                    path.addTo(markerLayer);
                } else {
                    const marker = createDirectionalMarker([loc.y, loc.x], loc.orientation, loc.field_of_view, loc.title, loc.comments, loc.url, loc.type);
                    marker.session_id = loc.session_id || Date.now() + Math.random();
                    marker.addTo(markerLayer);
                }
            });
        }).catch(err => console.warn('Marker load skipped.', err));
}

// 6. Vector Path Generator (With Arrowhead Math)
function createVideoPath(startLatLng, endLatLng, url, title) {
    // Basic Trigonometry to calculate the arrow angle
    const dx = endLatLng.lng - startLatLng.lng;
    const dy = endLatLng.lat - startLatLng.lat;
    const angle = Math.atan2(dy, dx);
    const size = 20; // Pixel size of the arrowhead

    // Project points 30 degrees off the main angle to form the base of the triangle
    const p1 = [endLatLng.lat, endLatLng.lng];
    const p2 = [endLatLng.lat - size * Math.sin(angle - Math.PI / 6), endLatLng.lng - size * Math.cos(angle - Math.PI / 6)];
    const p3 = [endLatLng.lat - size * Math.sin(angle + Math.PI / 6), endLatLng.lng - size * Math.cos(angle + Math.PI / 6)];

    const arrow = L.polygon([p1, p2, p3], {color: '#9c27b0', fillColor: '#9c27b0', fillOpacity: 1, weight: 1});
    const line = L.polyline([startLatLng, endLatLng], {color: '#9c27b0', weight: 4, opacity: 0.8});
    
    const group = L.featureGroup([line, arrow]);

    group.on('mouseover', () => {
        line.setStyle({ weight: 6, color: '#e040fb' });
        arrow.setStyle({ color: '#e040fb', fillColor: '#e040fb' });
    });
    group.on('mouseout', () => {
        line.setStyle({ weight: 4, color: '#9c27b0' });
        arrow.setStyle({ color: '#9c27b0', fillColor: '#9c27b0' });
    });

    group.bindTooltip(`<b>${title || 'Video Path'}</b><br>Click to play`, { direction: 'center', className: 'nav-tooltip' });

    group.on('click', (evt) => {
        L.DomEvent.stop(evt);
        if (typeof isEditMode !== 'undefined' && isEditMode) {
            if (confirm(`Delete video path: ${title || 'Untitled'}?`)) {
                group.remove();
                if (typeof sessionMarkers !== 'undefined' && group.session_id) {
                    sessionMarkers = sessionMarkers.filter(m => m.session_id !== group.session_id);
                    const countEl = document.getElementById('session-count');
                    if (countEl) countEl.textContent = sessionMarkers.length;
                }
            }
        } else {
            openPhotoViewer({ title: title, url: url, type: 'video' });
        }
    });

    return group;
}

// 7. Point Marker Generator
function createDirectionalMarker(latlng, angle, fov, title, comments, url, type) {
    const dotColor = type === 'panorama' ? '#28a745' : '#007bff';
    const marker = L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 2, fillColor: dotColor, fillOpacity: 0.9 });
    let hoverPolygon = null;

    marker.on('mouseover', () => {
        if (fov > 0 && fov < 360) {
            const points = [latlng];
            for (let a = angle - (fov/2); a <= angle + (fov/2); a += 5) points.push([latlng[0] + 80 * Math.cos(a * Math.PI / 180), latlng[1] + 80 * Math.sin(a * Math.PI / 180)]);
            hoverPolygon = L.polygon(points, { color: dotColor, weight: 0.5, fillColor: dotColor, fillOpacity: 0.05, interactive: false }).addTo(markerLayer);
        }
        marker.setRadius(8);
    });

    marker.on('mouseout', () => { if (hoverPolygon) { markerLayer.removeLayer(hoverPolygon); hoverPolygon = null; } marker.setRadius(6); });

    if (url) {
        marker.bindTooltip(`<div style="text-align: center; width: 200px;"><img src="${url}" style="width: 200px; height: 130px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;" alt="Preview">${title ? `<b style="font-size:0.9em; display:block;">${title}</b>` : ''}</div>`, { direction: 'top', className: 'photo-tooltip', offset: [0, -15] });
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
        } else openPhotoViewer({ title, comments, url, type, fov }); 
    });
    return marker;
}

// 8. Modal Viewer (Handles Images, Panoramas, and YouTube)
function openPhotoViewer(data) {
    const modal = document.getElementById('photo-modal');
    const container = document.getElementById('viewer-container');
    const titleEl = document.getElementById('modal-title');
    
    container.innerHTML = '';
    if (viewerInstance) { viewerInstance.destroy(); viewerInstance = null; }
    modal.classList.remove('modal-hidden');

    const dt = data.title ? `<b>${data.title}</b>` : '';
    const dc = data.comments ? `<span style="font-weight:normal; font-style:italic; margin-left:15px; font-size:0.9em;">- ${data.comments}</span>` : '';
    const sep = (data.title && data.comments) ? ' ' : '';
    titleEl.innerHTML = (!data.title && !data.comments) ? 'Media View' : `${dt}${sep}${dc}`;
    
    if (data.type === 'video' || (data.url && data.url.includes('.mp4'))) {
        // Parse YouTube URL to extract the unique Video ID
        const videoIdMatch = data.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
        const cleanId = videoIdMatch ? videoIdMatch[1] : null;
        
        if (cleanId) {
            // YouTube Embed: Added &mute=1 to ensure autoplay works
            container.innerHTML = `<iframe width="100%" height="100%" style="border:none;" src="https://www.youtube.com/embed/${cleanId}?autoplay=1&mute=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else if (data.url.includes('.mp4')) {
             // Local MP4: Added 'muted' attribute
             container.innerHTML = `<video controls autoplay muted style="max-width: 100%; max-height: 100%; width: 100%;"><source src="${data.url}" type="video/mp4">Your browser does not support the video tag.</video>`;
        } else {
             container.innerHTML = `<p style="color:white; padding:20px;"><b>Error:</b> Invalid video URL.</p>`;
        }
    } else if (data.type === 'panorama') {
        viewerInstance = pannellum.viewer('viewer-container', { 
            "type": "equirectangular", "panorama": data.url, "autoLoad": true, 
            "haov": data.fov >= 360 ? 360 : data.fov, "minYaw": data.fov >= 360 ? -180 : -(data.fov / 2), "maxYaw": data.fov >= 360 ? 180 : (data.fov / 2), 
            "hfov": 110, "maxHfov": 150, "vaov": 65 
        });
        viewerInstance.on('zoomchange', (newHfov) => titleEl.innerHTML = `${dt}${sep}${dc} <span style="float:right; font-size:0.8em;">[HFOV: ${Math.round(newHfov)}]</span>`);
        titleEl.innerHTML = `${dt}${sep}${dc} <span style="float:right; font-size:0.8em;">[HFOV: 110]</span>`;
    } else {
        const img = document.createElement('img');
        img.src = data.url; img.className = 'standard-img';
        img.onerror = () => container.innerHTML = `<p style="color:white; padding:20px;"><b>Error:</b> Image failed to load.</p>`;
        container.appendChild(img);
    }
}

// 9. Initialization & Map Legend
const mapLegend = L.control({ position: 'bottomleft' });

mapLegend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
        <h4>Map Key</h4>
        <div class="legend-item"><span class="legend-icon" style="background: #007bff;"></span> Standard Photo</div>
        <div class="legend-item"><span class="legend-icon" style="background: #28a745;"></span> 360° Panorama</div>
        <div class="legend-item"><span class="legend-line"></span> Video Walkthrough</div>
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-modal')?.addEventListener('click', () => { 
        document.getElementById('photo-modal').classList.add('modal-hidden'); 
        if (viewerInstance) { viewerInstance.destroy(); viewerInstance = null; } 
    });
    document.getElementById('map-selector')?.addEventListener('change', (e) => switchMap(e.target.value));
    
    map.setView([0, 0], 0);
    
    // Mount the legend to the map
    mapLegend.addTo(map); 
    
    switchMap('overview');
});