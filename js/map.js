const mapConfigs = {
    'lvl1-south': { url: 'assets/floorplans/lvl1-south.png', bounds: [[0, 0], [1142, 2236]], center: [571, 1118], scale: 1.1 },
    'lvl1-north': { url: 'assets/floorplans/lvl1-north.png', bounds: [[0, 0], [1156, 2231]], center: [578, 1115], scale: 1.5 },
    'lvl2-social': { url: 'assets/floorplans/lvl2-social.png', bounds: [[0, 0], [1135, 2074]], center: [567.5, 1037], scale: 1.33 },
    'aggiecommons': { url: 'assets/floorplans/aggiecommons.png', bounds: [[0, 0], [996, 1498]], center: [498, 749], scale: 1.4 }
};

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, attributionControl: false });
let currentImageOverlay, markerLayer = L.layerGroup().addTo(map), viewerInstance = null;

function switchMap(mapId) {
    const config = mapConfigs[mapId];
    if (!config) return;
    if (currentImageOverlay) map.removeLayer(currentImageOverlay);
    markerLayer.clearLayers();
    currentImageOverlay = L.imageOverlay(config.url, config.bounds);
    currentImageOverlay.on('load', () => { map.fitBounds(config.bounds); loadSavedMarkers(mapId); });
    currentImageOverlay.on('error', () => alert(`Error: Floorplan not found at ${config.url}`));
    currentImageOverlay.addTo(map);
    if (typeof initEditor === 'function') initEditor(mapId, config.bounds);
}

function loadSavedMarkers(mapId) {
    fetch(`data/locations.json?t=${Date.now()}`)
        .then(res => { if (!res.ok) throw new Error("File not found."); return res.json(); })
        .then(data => {
            data.filter(item => item.map_id === mapId).forEach(loc => {
                const marker = createDirectionalMarker([loc.y, loc.x], loc.orientation, loc.field_of_view, loc.title, loc.comments, loc.url, loc.type);
                marker.session_id = loc.session_id || Date.now() + Math.random();
                marker.addTo(markerLayer);
            });
        }).catch(err => console.warn('Marker load skipped.', err));
}

function createDirectionalMarker(latlng, angle, fov, title, comments, url, type) {
    const dotColor = type === 'panorama' ? '#28a745' : '#007bff';
    const marker = L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 2, fillColor: dotColor, fillOpacity: 0.9 });
    let hoverPolygon = null;

    marker.on('mouseover', () => {
        if (fov > 0 && fov < 360) {
            const points = [latlng];
            for (let a = angle - (fov/2); a <= angle + (fov/2); a += 5) {
                points.push([latlng[0] + 80 * Math.cos(a * Math.PI / 180), latlng[1] + 80 * Math.sin(a * Math.PI / 180)]);
            }
            hoverPolygon = L.polygon(points, { color: dotColor, weight: 0.5, fillColor: dotColor, fillOpacity: 0.05, interactive: false }).addTo(markerLayer);
        }
        marker.setRadius(8);
    });

    marker.on('mouseout', () => { if (hoverPolygon) { markerLayer.removeLayer(hoverPolygon); hoverPolygon = null; } marker.setRadius(6); });

    if (url) marker.bindTooltip(`<div style="text-align:center; max-width:200px;"><img src="${url}" style="width:100%; border-radius:4px; margin-bottom:5px;">${title ? `<b>${title}</b>` : ''}</div>`, { direction: 'top', className: 'photo-tooltip' });

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
        } else { openPhotoViewer({ title, comments, url, type, fov }); }
    });
    return marker;
}

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
    
    if (data.type === 'panorama') {
        viewerInstance = pannellum.viewer('viewer-container', { "type": "equirectangular", "panorama": data.url, "autoLoad": true, "haov": data.fov >= 360 ? 360 : data.fov, "minYaw": data.fov >= 360 ? -180 : -(data.fov / 2), "maxYaw": data.fov >= 360 ? 180 : (data.fov / 2), "hfov": 110, "maxHfov": 150, "vaov": 65 });
        viewerInstance.on('zoomchange', (newHfov) => titleEl.innerHTML = `${dt}${sep}${dc} <span style="float:right; font-size:0.8em;">[HFOV: ${Math.round(newHfov)}]</span>`);
        titleEl.innerHTML = `${dt}${sep}${dc} <span style="float:right; font-size:0.8em;">[HFOV: 110]</span>`;
    } else {
        titleEl.innerHTML = (!data.title && !data.comments) ? 'Photo View' : `${dt}${sep}${dc}`;
        const img = document.createElement('img');
        img.src = data.url; img.className = 'standard-img';
        img.onerror = () => container.innerHTML = `<p style="color:white; padding:20px;"><b>Error:</b> Image failed to load.</p>`;
        container.appendChild(img);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-modal')?.addEventListener('click', () => { document.getElementById('photo-modal').classList.add('modal-hidden'); if (viewerInstance) { viewerInstance.destroy(); viewerInstance = null; } });
    document.getElementById('map-selector')?.addEventListener('change', (e) => switchMap(e.target.value));
    map.setView([0, 0], 0);
    switchMap('lvl1-south');
});