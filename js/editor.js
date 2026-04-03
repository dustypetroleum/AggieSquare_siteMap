let isEditMode = false;
let currentMapBounds;
let currentMapId;

let currentTool = 'point';
let placementState = 'none';

let tempMarker, tempPolygon, sessionMarkers = [], currentAngle = 0, lastTargetLatLng = null;
let measureStart = null, tempMeasureLine = null;
let highlightStart = null, tempHighlightRect = null, highlights = [];

let measureLayers = L.featureGroup();
let highlightLayers = L.featureGroup();

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

document.addEventListener('DOMContentLoaded', () => {
    measureLayers.addTo(map);
    highlightLayers.addTo(map);
});

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
    measureLayers.clearLayers();
    highlightLayers.clearLayers();
}

function resetEditorWorkflow() {
    placementState = 'none';
    lastTargetLatLng = null;
    measureStart = null;
    highlightStart = null;
    if (tempMarker) map.removeLayer(tempMarker);
    if (tempPolygon) map.removeLayer(tempPolygon);
    if (tempMeasureLine) map.removeLayer(tempMeasureLine);
    if (tempHighlightRect) map.removeLayer(tempHighlightRect);
    if (sidebarForm) sidebarForm.reset();
}

function setTool(tool) {
    currentTool = tool;
    resetEditorWorkflow();
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-tool-${tool}`);
    if (activeBtn) activeBtn.classList.add('active');

    const mapContainer = document.getElementById('map');
    if (tool === 'point') mapContainer.style.cursor = 'crosshair';
    else if (tool === 'measure') mapContainer.style.cursor = 'help';
    else if (tool === 'highlight') mapContainer.style.cursor = 'cell';
}

function setMode(mode) {
    isEditMode = (mode === 'edit');
    bodyElement.classList.toggle('edit-mode', isEditMode);
    bodyElement.classList.toggle('view-mode', !isEditMode);
    
    const btnEdit = document.getElementById('btn-edit');
    const btnView = document.getElementById('btn-view');
    if (btnEdit) btnEdit.classList.toggle('active', isEditMode);
    if (btnView) btnView.classList.toggle('active', !isEditMode);
    
    if (!isEditMode) resetEditorWorkflow();
    else setTool('point');
}

document.addEventListener('DOMContentLoaded', () => {
    const btnEdit = document.getElementById('btn-edit');
    const btnView = document.getElementById('btn-view');
    const btnCancel = document.getElementById('btn-cancel');
    const btnDownload = document.getElementById('btn-download-batch');
    const btnReport = document.getElementById('btn-floor-report');

    if (btnEdit) btnEdit.addEventListener('click', () => setMode('edit'));
    if (btnView) btnView.addEventListener('click', () => setMode('view'));
    if (btnCancel) btnCancel.addEventListener('click', resetEditorWorkflow);
    if (btnReport) btnReport.addEventListener('click', generateFloorReport);

    if (sidebarForm) {
        sidebarForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!tempMarker || placementState !== 'vector_target_set') return alert("Place location and click to set direction.");

            const urlVal = document.getElementById('edit-url').value.toLowerCase();
            if (urlVal.endsWith('.heic')) return alert("Warning: .HEIC files are not supported. Convert to .JPG.");

            const markerData = {
                session_id: Date.now(), map_id: currentMapId,
                title: document.getElementById('edit-title').value,
                comments: document.getElementById('edit-comments').value,
                type: document.getElementById('edit-type').value,
                x: Math.round(tempMarker.getLatLng().lng), y: Math.round(tempMarker.getLatLng().lat),
                orientation: currentAngle, field_of_view: parseInt(inputFov.value),
                url: document.getElementById('edit-url').value
            };

            sessionMarkers.push(markerData);
            const countEl = document.getElementById('session-count');
            if (countEl) countEl.textContent = sessionMarkers.length;

            const finalizedMarker = createDirectionalMarker([markerData.y, markerData.x], markerData.orientation, markerData.field_of_view, markerData.title, markerData.comments, markerData.url, markerData.type);
            finalizedMarker.session_id = markerData.session_id; 
            finalizedMarker.addTo(markerLayer);
            resetEditorWorkflow();
        });
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            if (sessionMarkers.length === 0) return alert("No points added.");
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionMarkers, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `map_locations_${Date.now()}.json`);
            document.body.appendChild(downloadAnchorNode); 
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }
});

function formatDistance(pixels) {
    const scale = mapConfigs[currentMapId]?.scale || 1; 
    const totalInches = pixels * scale;
    return `${Math.floor(totalInches / 12)}' ${Math.round(totalInches % 12)}"`;
}

map.on('click', (e) => {
    if (!isEditMode) return;
    if (currentTool === 'point') {
        if (placementState === 'none') {
            placementState = 'location_placed';
            tempMarker = L.circleMarker(e.latlng, { radius: 6, color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }).addTo(map);
        } else if (placementState === 'location_placed') {
            placementState = 'vector_target_set';
            lastTargetLatLng = e.latlng;
            drawDynamicFov(lastTargetLatLng); 
        } else if (placementState === 'vector_target_set') placementState = 'location_placed'; 
    } else if (currentTool === 'measure') {
        if (!measureStart) measureStart = e.latlng;
        else {
            L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(measureLayers).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: true, direction: 'center'}).openTooltip();
            measureStart = null;
            if (tempMeasureLine) map.removeLayer(tempMeasureLine);
        }
    } else if (currentTool === 'highlight') {
        if (!highlightStart) highlightStart = e.latlng;
        else {
            const bounds = [highlightStart, e.latlng];
            const comment = prompt("Enter a label or comment for this area:") || "No comment";
            const rect = L.rectangle(bounds, { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b" }).addTo(highlightLayers);
            const id = highlights.length + 1;
            highlights.push({ id, bounds, comment, map_id: currentMapId });
            L.marker(rect.getBounds().getCenter(), { icon: L.divIcon({ className: 'highlight-label', html: `<div style="background:white; color:black; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-weight:bold; border:1px solid #333; font-size:12px;">${id}</div>` }) }).addTo(highlightLayers);
            highlightStart = null;
            if (tempHighlightRect) map.removeLayer(tempHighlightRect);
        }
    }
});

map.on('mousemove', (e) => {
    if (!isEditMode) return;
    if (currentTool === 'point' && placementState === 'location_placed') {
        lastTargetLatLng = e.latlng;
        drawDynamicFov(lastTargetLatLng);
    } else if (currentTool === 'measure' && measureStart) {
        if (tempMeasureLine) map.removeLayer(tempMeasureLine);
        tempMeasureLine = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(map).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: false}).openTooltip(e.latlng);
    } else if (currentTool === 'highlight' && highlightStart) {
        if (tempHighlightRect) map.removeLayer(tempHighlightRect);
        tempHighlightRect = L.rectangle([highlightStart, e.latlng], { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b", interactive: false }).addTo(map);
    }
});

function drawDynamicFov(targetLatLng) {
    if (!tempMarker || !targetLatLng) return;
    if (tempPolygon) map.removeLayer(tempPolygon);

    const center = tempMarker.getLatLng();
    const fov = parseInt(inputFov.value) || 90;
    const dx = targetLatLng.lng - center.lng, dy = targetLatLng.lat - center.lat;
    const radius = Math.max(30, Math.sqrt(dx*dx + dy*dy)); 
    currentAngle = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);

    if (fov >= 360) {
        tempPolygon = L.circle(center, { radius: radius, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
        return;
    }

    const halfFov = fov / 2, points = [center];
    for (let a = currentAngle - halfFov; a <= currentAngle + halfFov; a += 2) {
        const rad = a * Math.PI / 180;
        points.push([center.lat + radius * Math.cos(rad), center.lng + radius * Math.sin(rad)]);
    }
    tempPolygon = L.polygon(points, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}

if (inputFov) inputFov.addEventListener('input', () => { if ((placementState === 'location_placed' || placementState === 'vector_target_set') && lastTargetLatLng) drawDynamicFov(lastTargetLatLng); });

function generateFloorReport() {
    const currentHighlights = highlights.filter(h => h.map_id === currentMapId);
    if (currentHighlights.length === 0) return alert("No highlights have been drawn on this floor yet.");

    const reportWindow = window.open('', '_blank');
    let htmlContent = `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;"><h1 style="border-bottom: 2px solid #ccc; padding-bottom: 10px;">Floor Report: ${currentMapId}</h1><p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px;"><thead><tr style="background-color: #f2f2f2;"><th style="border: 1px solid #ddd; padding: 12px; text-align: center; width: 50px;">ID</th><th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Notes / Comments</th></tr></thead><tbody>`;
    currentHighlights.forEach(h => htmlContent += `<tr><td style="border: 1px solid #ddd; padding: 12px; text-align: center;"><strong>${h.id}</strong></td><td style="border: 1px solid #ddd; padding: 12px;">${h.comment}</td></tr>`);
    htmlContent += `</tbody></table><div style="margin-top: 30px; text-align: center;"><button onclick="window.print()" style="padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px; font-size: 16px;">Print / Save to PDF</button></div><style>@media print { button { display: none !important; } }</style></div>`;

    reportWindow.document.write(`<html><head><title>Floor Report - ${currentMapId}</title></head><body>${htmlContent}</body></html>`);
    reportWindow.document.close();
}