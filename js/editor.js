// Global State
let isEditMode = false, currentMapBounds, currentMapId, currentTool = 'point', placementState = 'none';
let tempMarker, tempPolygon, sessionMarkers = [], currentAngle = 0, lastTargetLatLng = null;
let measureStart = null, tempMeasureLine = null;
let highlightStart = null, tempHighlightRect = null, highlights = [], highlightCounter = 1;

let measureLayers = L.featureGroup();
let highlightLayers = L.featureGroup();

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

// 1. Core Functions (Loaded First)
function generateFloorReport() {
    const ch = highlights.filter(h => h.map_id === currentMapId); 
    if (ch.length === 0) {
        alert("No highlights exist on this floor. Draw a highlight first to generate a report.");
        return;
    }

    const rw = window.open('', '_blank');
    if (!rw) {
        alert("Your browser blocked the report from opening. Please allow popups for this site.");
        return;
    }

    let h = `<div style="font-family: Arial; padding: 20px;"><h1 style="border-bottom: 2px solid #ccc;">Floor Report: ${currentMapId}</h1><p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p><table style="width: 100%; border-collapse: collapse; margin-top: 20px;"><thead><tr style="background: #f2f2f2;"><th style="border: 1px solid #ddd; padding: 12px; width: 50px;">ID</th><th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Notes & Comments</th></tr></thead><tbody>`;
    ch.forEach(x => {
        h += `<tr><td style="border: 1px solid #ddd; padding: 12px; text-align: center;"><strong>${x.id}</strong></td><td style="border: 1px solid #ddd; padding: 12px;">${x.comment}</td></tr>`;
    });
    h += `</tbody></table><div style="margin-top: 30px; text-align: center;"><button onclick="window.print()" style="padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px;">Print PDF</button></div><style>@media print { button { display: none !important; } }</style></div>`;
    
    rw.document.write(`<html><head><title>Floor Report</title></head><body>${h}</body></html>`); 
    rw.document.close();
}

function initEditor(mapId, bounds) { 
    currentMapId = mapId; 
    currentMapBounds = bounds; 
    resetEditorWorkflow(); 
    measureLayers.clearLayers(); 
    highlightLayers.clearLayers(); 
    highlights = []; 
    highlightCounter = 1;
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
    
    // Update button visuals
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-tool-${tool}`)?.classList.add('active');
    
    // Fetch elements dynamically
    const mc = document.getElementById('map');
    const form = document.getElementById('editor-form'); 
    
    // Toggle cursor and form visibility
    if (tool === 'point') {
        mc.style.cursor = 'crosshair';
        if (form) form.style.display = 'flex';
    } else if (tool === 'measure') {
        mc.style.cursor = 'help';
        if (form) form.style.display = 'none';
    } else if (tool === 'highlight') {
        mc.style.cursor = 'cell';
        if (form) form.style.display = 'none';
    }
}

function setMode(mode) {
    isEditMode = (mode === 'edit');
    bodyElement.classList.toggle('edit-mode', isEditMode); 
    bodyElement.classList.toggle('view-mode', !isEditMode);
    document.getElementById('btn-edit')?.classList.toggle('active', isEditMode);
    document.getElementById('btn-view')?.classList.toggle('active', !isEditMode);
    if (!isEditMode) resetEditorWorkflow(); 
    else setTool('point');
}

function formatDistance(px) { 
    const totalInches = px * (mapConfigs[currentMapId]?.scale || 1); 
    return `${Math.floor(totalInches / 12)}' ${Math.round(totalInches % 12)}"`; 
}

function drawDynamicFov(tll) {
    if (!tempMarker || !tll) return; 
    if (tempPolygon) map.removeLayer(tempPolygon);
    const c = tempMarker.getLatLng();
    const fov = parseInt(inputFov.value) || 90;
    const dx = tll.lng - c.lng;
    const dy = tll.lat - c.lat;
    const rad = Math.max(30, Math.sqrt(dx*dx + dy*dy));
    currentAngle = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);
    
    if (fov >= 360) { 
        tempPolygon = L.circle(c, { radius: rad, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map); 
        return; 
    }
    const hf = fov / 2;
    const pts = [c];
    for (let a = currentAngle - hf; a <= currentAngle + hf; a += 2) {
        pts.push([c.lat + rad * Math.cos(a * Math.PI / 180), c.lng + rad * Math.sin(a * Math.PI / 180)]);
    }
    tempPolygon = L.polygon(pts, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}

// 2. Event Listeners
document.addEventListener('DOMContentLoaded', () => { 
    measureLayers.addTo(map); 
    highlightLayers.addTo(map); 

    document.getElementById('btn-edit')?.addEventListener('click', () => setMode('edit'));
    document.getElementById('btn-view')?.addEventListener('click', () => setMode('view'));
    document.getElementById('btn-cancel')?.addEventListener('click', resetEditorWorkflow);
    document.getElementById('btn-floor-report')?.addEventListener('click', generateFloorReport);

    sidebarForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!tempMarker || placementState !== 'vector_target_set') return alert("Set direction.");
        if (document.getElementById('edit-url').value.toLowerCase().endsWith('.heic')) return alert("Convert HEIC to JPG.");
        
        const md = { 
            session_id: Date.now(), map_id: currentMapId, 
            title: document.getElementById('edit-title').value, 
            comments: document.getElementById('edit-comments').value, 
            type: document.getElementById('edit-type').value, 
            x: Math.round(tempMarker.getLatLng().lng), 
            y: Math.round(tempMarker.getLatLng().lat), 
            orientation: currentAngle, field_of_view: parseInt(inputFov.value), 
            url: document.getElementById('edit-url').value 
        };
        
        sessionMarkers.push(md);
        const ce = document.getElementById('session-count'); 
        if (ce) ce.textContent = sessionMarkers.length;
        
        const fm = createDirectionalMarker([md.y, md.x], md.orientation, md.field_of_view, md.title, md.comments, md.url, md.type);
        fm.session_id = md.session_id; 
        fm.addTo(markerLayer); 
        resetEditorWorkflow();
    });

    document.getElementById('btn-download-batch')?.addEventListener('click', () => {
        if (sessionMarkers.length === 0) return alert("No points.");
        const a = document.createElement('a'); 
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionMarkers, null, 2));
        a.download = `map_locations_${Date.now()}.json`; 
        document.body.appendChild(a); a.click(); a.remove();
    });
});

if (inputFov) {
    inputFov.addEventListener('input', () => { 
        if ((placementState === 'location_placed' || placementState === 'vector_target_set') && lastTargetLatLng) {
            drawDynamicFov(lastTargetLatLng); 
        }
    });
}

// 3. Map Interactions
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
        } else if (placementState === 'vector_target_set') {
            placementState = 'location_placed';
        }
    } else if (currentTool === 'measure') {
        if (!measureStart) measureStart = e.latlng;
        else { 
            const line = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(measureLayers).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: true, direction: 'center'}).openTooltip(); 
            line.on('click', function(evt) { L.DomEvent.stop(evt); if (confirm("Delete this measurement?")) measureLayers.removeLayer(this); });
            measureStart = null; 
            if (tempMeasureLine) map.removeLayer(tempMeasureLine); 
        }
    } else if (currentTool === 'highlight') {
        if (!highlightStart) highlightStart = e.latlng;
        else {
            const bounds = [highlightStart, e.latlng], comment = prompt("Label:") || "No comment", id = highlightCounter++;
            const rect = L.rectangle(bounds, { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b" }).addTo(highlightLayers);
            const label = L.marker(rect.getBounds().getCenter(), { icon: L.divIcon({ className: 'highlight-label', html: `<div style="background:white; color:black; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-weight:bold; border:1px solid #333; font-size:12px;">${id}</div>` }) }).addTo(highlightLayers);
            highlights.push({ id, bounds, comment, map_id: currentMapId, rect, label });
            rect.on('click', function(evt) { L.DomEvent.stop(evt); if (confirm("Delete this highlight?")) { highlightLayers.removeLayer(rect); highlightLayers.removeLayer(label); highlights = highlights.filter(h => h.id !== id); } });
            highlightStart = null; 
            if (tempHighlightRect) map.removeLayer(tempHighlightRect);
        }
    }
});

map.on('mousemove', (e) => {
    if (!isEditMode) return;
    if (currentTool === 'point' && placementState === 'location_placed') { 
        lastTargetLatLng = e.latlng; drawDynamicFov(lastTargetLatLng); 
    } else if (currentTool === 'measure' && measureStart) { 
        if (tempMeasureLine) map.removeLayer(tempMeasureLine); 
        tempMeasureLine = L.polyline([measureStart, e.latlng], {color: '#dc3545', dashArray: '5, 10'}).addTo(map).bindTooltip(formatDistance(map.distance(measureStart, e.latlng)), {permanent: false}).openTooltip(e.latlng); 
    } else if (currentTool === 'highlight' && highlightStart) { 
        if (tempHighlightRect) map.removeLayer(tempHighlightRect); 
        tempHighlightRect = L.rectangle([highlightStart, e.latlng], { color: "#ffeb3b", weight: 1, fillOpacity: 0.1, fillColor: "#ffeb3b", interactive: false }).addTo(map); 
    }
});