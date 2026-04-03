let isEditMode = false, currentMapBounds, currentMapId, currentTool = 'point', placementState = 'none';
let tempMarker, tempPolygon, sessionMarkers = [], currentAngle = 0, lastTargetLatLng = null;
let measureStart = null, tempMeasureLine = null, highlightStart = null, tempHighlightRect = null, highlights = [];
let measureLayers = L.featureGroup(), highlightLayers = L.featureGroup();
const bodyElement = document.body, sidebarForm = document.getElementById('editor-form'), inputFov = document.getElementById('edit-fov');

document.addEventListener('DOMContentLoaded', () => { measureLayers.addTo(map); highlightLayers.addTo(map); });

function initEditor(mapId, bounds) { currentMapId = mapId; currentMapBounds = bounds; resetEditorWorkflow(); measureLayers.clearLayers(); highlightLayers.clearLayers(); }

function resetEditorWorkflow() {
    placementState = 'none'; lastTargetLatLng = null; measureStart = null; highlightStart = null;
    if (tempMarker) map.removeLayer(tempMarker); if (tempPolygon) map.removeLayer(tempPolygon);
    if (tempMeasureLine) map.removeLayer(tempMeasureLine); if (tempHighlightRect) map.removeLayer(tempHighlightRect);
    if (sidebarForm) sidebarForm.reset();
}

function setTool(tool) {
    currentTool = tool; resetEditorWorkflow();
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-tool-${tool}`)?.classList.add('active');
    const mc = document.getElementById('map');
    if (tool === 'point') mc.style.cursor = 'crosshair'; else if (tool === 'measure') mc.style.cursor = 'help'; else if (tool === 'highlight') mc.style.cursor = 'cell';
}

function setMode(mode) {
    isEditMode = (mode === 'edit');
    bodyElement.classList.toggle('edit-mode', isEditMode); bodyElement.classList.toggle('view-mode', !isEditMode);
    document.getElementById('btn-edit')?.classList.toggle('active', isEditMode);
    document.getElementById('btn-view')?.classList.toggle('active', !isEditMode);
    if (!isEditMode) resetEditorWorkflow(); else setTool('point');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-edit')?.addEventListener('click', () => setMode('edit'));
    document.getElementById('btn-view')?.addEventListener('click', () => setMode('view'));
    document.getElementById('btn-cancel')?.addEventListener('click', resetEditorWorkflow);
    document.getElementById('btn-floor-report')?.addEventListener('click', generateFloorReport);

    sidebarForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!tempMarker || placementState !== 'vector_target_set') return alert("Set direction.");
        if (document.getElementById('edit-url').value.toLowerCase().endsWith('.heic')) return alert("Convert HEIC to JPG.");
        const md = { session_id: Date.now(), map_id: currentMapId, title: document.getElementById('edit-title').value, comments: document.getElementById('edit-comments').value, type: document.getElementById('edit-type').value, x: Math.round(tempMarker.getLatLng().lng), y: Math.round(tempMarker.getLatLng().lat), orientation: currentAngle, field_of_view: parseInt(inputFov.value), url: document.getElementById('edit-url').value };
        sessionMarkers.push(md);
        const ce = document.getElementById('session-count'); if (ce) ce.textContent = sessionMarkers.length;
        const fm = createDirectionalMarker([md.y, md.x], md.orientation, md.field_of_view, md.title, md.comments, md.url, md.type);
        fm.session_id = md.session_id; fm.addTo(markerLayer); resetEditorWorkflow();
    });

    document.getElementById('btn-download-batch')?.addEventListener('click', () => {
        if (sessionMarkers.length === 0) return alert("No points.");
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionMarkers, null, 2));
        a.download = `map_locations_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove();
    });
});

function formatDistance(px) { const totalInches = px * (mapConfigs[currentMapId]?.scale || 1); return `${Math.floor(totalInches / 12)}' ${Math.round(totalInches % 12)}"`; }

map.on('click', (e) => {
    if (!isEditMode) return;
    if (currentTool === 'point') {
        if (placementState === 'none') { placementState = 'location_placed'; tempMarker = L.circleMarker(e.latlng, { radius: 6, color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }).addTo(map); }
        else if (placementState === 'location_placed') { placementState = 'vector_target_set'; lastTargetLatLng = e.latlng; drawDynamicFov(lastTargetLatLng); }
        else if (placementState === 'vector_target_set') placementState = 'location_placed';
    } else if (currentTool === 'measure') {
        if (!measureStart) measureStart = e.latlng;
        else { L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(measureLayers).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: true, direction: 'center'}).openTooltip(); measureStart = null; if (tempMeasureLine) map.removeLayer(tempMeasureLine); }
    } else if (currentTool === 'highlight') {
        if (!highlightStart) highlightStart = e.latlng;
        else {
            const bounds = [highlightStart, e.latlng], comment = prompt("Label:") || "No comment";
            const rect = L.rectangle(bounds, { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b" }).addTo(highlightLayers);
            const id = highlights.length + 1; highlights.push({ id, bounds, comment, map_id: currentMapId });
            L.marker(rect.getBounds().getCenter(), { icon: L.divIcon({ className: 'highlight-label', html: `<div style="background:white; color:black; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-weight:bold; border:1px solid #333; font-size:12px;">${id}</div>` }) }).addTo(highlightLayers);
            highlightStart = null; if (tempHighlightRect) map.removeLayer(tempHighlightRect);
        }
    }
});

map.on('mousemove', (e) => {
    if (!isEditMode) return;
    if (currentTool === 'point' && placementState === 'location_placed') { lastTargetLatLng = e.latlng; drawDynamicFov(lastTargetLatLng); }
    else if (currentTool === 'measure' && measureStart) { if (tempMeasureLine) map.removeLayer(tempMeasureLine); tempMeasureLine = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(map).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: false}).openTooltip(e.latlng); }
    else if (currentTool === 'highlight' && highlightStart) { if (tempHighlightRect) map.removeLayer(tempHighlightRect); tempHighlightRect = L.rectangle([highlightStart, e.latlng], { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b", interactive: false }).addTo(map); }
});

function drawDynamicFov(tll) {
    if (!tempMarker || !tll) return; if (tempPolygon) map.removeLayer(tempPolygon);
    const c = tempMarker.getLatLng(), fov = parseInt(inputFov.value) || 90;
    const dx = tll.lng - c.lng, dy = tll.lat - c.lat, rad = Math.max(30, Math.sqrt(dx*dx + dy*dy));
    currentAngle = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);
    if (fov >= 360) { tempPolygon = L.circle(c, { radius: rad, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map); return; }
    const hf = fov / 2, pts = [c];
    for (let a = currentAngle - hf; a <= currentAngle + hf; a += 2) pts.push([c.lat + rad * Math.cos(a * Math.PI / 180), c.lng + rad * Math.sin(a * Math.PI / 180)]);
    tempPolygon = L.polygon(pts, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}