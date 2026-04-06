let isEditMode = false, currentMapBounds, currentMapId, currentTool = 'point', placementState = 'none';
let tempMarker, tempPolygon, sessionMarkers = [], currentAngle = 0, lastTargetLatLng = null;
let measureStart = null, tempMeasureLine = null;
let highlightStart = null, tempHighlightRect = null, highlights = [], highlightCounter = 1;
let videoStart = null, tempVideoLine = null;

let measureLayers = L.featureGroup();
let highlightLayers = L.featureGroup();

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

function generateFloorReport() {
    if (currentMapId === 'overview') return alert("Floor reports are not available for the overview map.");
    const ch = highlights.filter(h => h.map_id === currentMapId); 
    if (ch.length === 0) return alert("No highlights exist on this floor.");

    const config = mapConfigs[currentMapId];
    let mapHtml = `<div style="position: relative; width: 100%; max-width: 800px; margin: 0 auto 20px auto; border: 1px solid #ccc; page-break-inside: avoid;"><img src="${config.url}" style="width: 100%; display: block;">`;

    ch.forEach(h => {
        const minLat = Math.min(h.bounds[0].lat, h.bounds[1].lat), maxLat = Math.max(h.bounds[0].lat, h.bounds[1].lat);
        const minLng = Math.min(h.bounds[0].lng, h.bounds[1].lng), maxLng = Math.max(h.bounds[0].lng, h.bounds[1].lng);
        mapHtml += `<div style="position: absolute; left: ${(minLng / config.bounds[1][1]) * 100}%; bottom: ${(minLat / config.bounds[1][0]) * 100}%; width: ${((maxLng - minLng) / config.bounds[1][1]) * 100}%; height: ${((maxLat - minLat) / config.bounds[1][0]) * 100}%; background-color: rgba(255, 235, 59, 0.4); border: 2px solid #ffeb3b; display: flex; align-items: center; justify-content: center; box-sizing: border-box;"><span style="background: white; color: black; border-radius: 50%; width: 22px; height: 22px; text-align: center; line-height: 22px; font-weight: bold; font-size: 12px; border: 1px solid #333; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">${h.id}</span></div>`;
    });
    mapHtml += `</div>`;

    let reportContent = `<div style="font-family: Arial; padding: 20px; max-width: 1000px; margin: 0 auto;"><h1 style="border-bottom: 2px solid #ccc; padding-bottom: 10px;">Floor Report: ${currentMapId}</h1><p style="margin-bottom: 20px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>${mapHtml}<table style="width: 100%; border-collapse: collapse; margin-top: 20px; page-break-before: auto;"><thead><tr style="background: #f2f2f2;"><th style="border: 1px solid #ddd; padding: 12px; width: 50px;">ID</th><th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Notes</th></tr></thead><tbody>`;
    ch.forEach(x => reportContent += `<tr><td style="border: 1px solid #ddd; padding: 12px; text-align: center;"><strong>${x.id}</strong></td><td style="border: 1px solid #ddd; padding: 12px;">${x.comment}</td></tr>`);
    reportContent += `</tbody></table></div>`;

    let printContainer = document.getElementById('print-report-container');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-report-container';
        document.body.appendChild(printContainer);
        const style = document.createElement('style');
        style.innerHTML = `@media print { body > *:not(#print-report-container) { display: none !important; } #print-report-container { display: block !important; position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } } @media screen { #print-report-container { display: none !important; } }`;
        document.head.appendChild(style);
    }
    printContainer.innerHTML = reportContent;
    setTimeout(() => window.print(), 500);
}

function initEditor(mapId, bounds) { 
    currentMapId = mapId; currentMapBounds = bounds; 
    if (mapId === 'overview' && isEditMode) setMode('view');
    resetEditorWorkflow(); 
    measureLayers.clearLayers(); highlightLayers.clearLayers(); highlights = []; highlightCounter = 1;

    const btnEdit = document.getElementById('btn-edit'), btnReport = document.getElementById('btn-floor-report');
    if (mapId === 'overview') {
        if (btnEdit) { btnEdit.disabled = true; btnEdit.style.opacity = '0.5'; btnEdit.style.cursor = 'not-allowed'; }
        if (btnReport) { btnReport.disabled = true; btnReport.style.opacity = '0.5'; btnReport.style.cursor = 'not-allowed'; }
    } else {
        if (btnEdit) { btnEdit.disabled = false; btnEdit.style.opacity = '1'; btnEdit.style.cursor = 'pointer'; }
        if (btnReport) { btnReport.disabled = false; btnReport.style.opacity = '1'; btnReport.style.cursor = 'pointer'; }
    }
}

function resetEditorWorkflow() {
    placementState = 'none'; lastTargetLatLng = null; measureStart = null; highlightStart = null; videoStart = null;
    if (tempMarker) map.removeLayer(tempMarker); if (tempPolygon) map.removeLayer(tempPolygon);
    if (tempMeasureLine) map.removeLayer(tempMeasureLine); if (tempHighlightRect) map.removeLayer(tempHighlightRect);
    if (tempVideoLine) map.removeLayer(tempVideoLine);
    if (sidebarForm) sidebarForm.reset();
}

function setTool(tool) {
    currentTool = tool; resetEditorWorkflow();
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-tool-${tool}`)?.classList.add('active');
    
    const mc = document.getElementById('map');
    if (tool === 'point') { mc.style.cursor = 'crosshair'; if (sidebarForm) sidebarForm.style.display = 'flex'; }
    else if (tool === 'measure') { mc.style.cursor = 'help'; if (sidebarForm) sidebarForm.style.display = 'none'; }
    else if (tool === 'highlight') { mc.style.cursor = 'cell'; if (sidebarForm) sidebarForm.style.display = 'none'; }
    else if (tool === 'video') { mc.style.cursor = 'crosshair'; if (sidebarForm) sidebarForm.style.display = 'none'; }
}

function setMode(mode) {
    if (mode === 'edit' && currentMapId === 'overview') return;
    isEditMode = (mode === 'edit');
    bodyElement.classList.toggle('edit-mode', isEditMode); bodyElement.classList.toggle('view-mode', !isEditMode);
    document.getElementById('btn-edit')?.classList.toggle('active', isEditMode);
    document.getElementById('btn-view')?.classList.toggle('active', !isEditMode);
    if (!isEditMode) resetEditorWorkflow(); else setTool('point');
}

function formatDistance(px) { return `${Math.floor((px * (mapConfigs[currentMapId]?.scale || 1)) / 12)}' ${Math.round((px * (mapConfigs[currentMapId]?.scale || 1)) % 12)}"`; }

function drawDynamicFov(tll) {
    if (!tempMarker || !tll) return; if (tempPolygon) map.removeLayer(tempPolygon);
    const c = tempMarker.getLatLng(), dx = tll.lng - c.lng, dy = tll.lat - c.lat, rad = Math.max(30, Math.sqrt(dx*dx + dy*dy));
    currentAngle = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
    if (parseInt(inputFov.value) >= 360) { tempPolygon = L.circle(c, { radius: rad, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map); return; }
    const pts = [c];
    for (let a = currentAngle - (parseInt(inputFov.value) / 2); a <= currentAngle + (parseInt(inputFov.value) / 2); a += 2) pts.push([c.lat + rad * Math.cos(a * Math.PI / 180), c.lng + rad * Math.sin(a * Math.PI / 180)]);
    tempPolygon = L.polygon(pts, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}

document.addEventListener('DOMContentLoaded', () => { 
    measureLayers.addTo(map); highlightLayers.addTo(map); 
    document.getElementById('btn-edit')?.addEventListener('click', () => setMode('edit'));
    document.getElementById('btn-view')?.addEventListener('click', () => setMode('view'));
    document.getElementById('btn-cancel')?.addEventListener('click', resetEditorWorkflow);
    document.getElementById('btn-floor-report')?.addEventListener('click', generateFloorReport);

    sidebarForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!tempMarker || placementState !== 'vector_target_set') return alert("Set direction.");
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

if (inputFov) inputFov.addEventListener('input', () => { if ((placementState === 'location_placed' || placementState === 'vector_target_set') && lastTargetLatLng) drawDynamicFov(lastTargetLatLng); });

map.on('click', (e) => {
    if (!isEditMode || currentMapId === 'overview') return;
    
    if (currentTool === 'point') {
        if (placementState === 'none') { placementState = 'location_placed'; tempMarker = L.circleMarker(e.latlng, { radius: 6, color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }).addTo(map); }
        else if (placementState === 'location_placed') { placementState = 'vector_target_set'; lastTargetLatLng = e.latlng; drawDynamicFov(lastTargetLatLng); }
        else if (placementState === 'vector_target_set') placementState = 'location_placed';
    } else if (currentTool === 'measure') {
        if (!measureStart) measureStart = e.latlng;
        else { 
            const line = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(measureLayers).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: true, direction: 'center'}).openTooltip(); 
            line.on('click', function(evt) { L.DomEvent.stop(evt); if (confirm("Delete this measurement?")) measureLayers.removeLayer(this); });
            measureStart = null; if (tempMeasureLine) map.removeLayer(tempMeasureLine); 
        }
    } else if (currentTool === 'highlight') {
        if (!highlightStart) highlightStart = e.latlng;
        else {
            const bounds = [highlightStart, e.latlng], comment = prompt("Label:") || "No comment", id = highlightCounter++;
            const rect = L.rectangle(bounds, { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b" }).addTo(highlightLayers);
            const label = L.marker(rect.getBounds().getCenter(), { icon: L.divIcon({ className: 'highlight-label', html: `<div style="background:white; color:black; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-weight:bold; border:1px solid #333; font-size:12px;">${id}</div>` }) }).addTo(highlightLayers);
            highlights.push({ id, bounds, comment, map_id: currentMapId, rect, label });
            rect.on('click', function(evt) { L.DomEvent.stop(evt); if (confirm("Delete this highlight?")) { highlightLayers.removeLayer(rect); highlightLayers.removeLayer(label); highlights = highlights.filter(h => h.id !== id); } });
            highlightStart = null; if (tempHighlightRect) map.removeLayer(tempHighlightRect);
        }
    } else if (currentTool === 'video') {
        if (!videoStart) videoStart = e.latlng;
        else {
            const url = prompt("Paste the YouTube video URL:");
            const title = prompt("Enter a title for this path:") || "Video Walkthrough";
            if (url) {
                const pathGroup = createVideoPath(videoStart, e.latlng, url, title);
                const sessionId = Date.now();
                pathGroup.session_id = sessionId;
                pathGroup.addTo(markerLayer);

                sessionMarkers.push({
                    session_id: sessionId, map_id: currentMapId, title: title, type: 'video_path',
                    x_start: Math.round(videoStart.lng), y_start: Math.round(videoStart.lat),
                    x_end: Math.round(e.latlng.lng), y_end: Math.round(e.latlng.lat), url: url
                });
                const ce = document.getElementById('session-count'); if (ce) ce.textContent = sessionMarkers.length;
            }
            videoStart = null; if (tempVideoLine) map.removeLayer(tempVideoLine);
        }
    }
});

map.on('mousemove', (e) => {
    if (!isEditMode || currentMapId === 'overview') return;
    if (currentTool === 'point' && placementState === 'location_placed') { lastTargetLatLng = e.latlng; drawDynamicFov(lastTargetLatLng); }
    else if (currentTool === 'measure' && measureStart) { if (tempMeasureLine) map.removeLayer(tempMeasureLine); tempMeasureLine = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(map).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: false}).openTooltip(e.latlng); }
    else if (currentTool === 'highlight' && highlightStart) { if (tempHighlightRect) map.removeLayer(tempHighlightRect); tempHighlightRect = L.rectangle([highlightStart, e.latlng], { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b", interactive: false }).addTo(map); }
    else if (currentTool === 'video' && videoStart) { if (tempVideoLine) map.removeLayer(tempVideoLine); tempVideoLine = L.polyline([videoStart, e.latlng], {color: '#9c27b0', dashArray: '5, 10'}).addTo(map); }
});