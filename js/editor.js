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
    if (currentMapId === 'overview') {
        alert("Floor reports are not available for the overview map.");
        return;
    }

    const ch = highlights.filter(h => h.map_id === currentMapId); 
    if (ch.length === 0) {
        alert("No highlights exist on this floor. Draw a highlight first to generate a report.");
        return;
    }

    const config = mapConfigs[currentMapId];
    const mapH = config.bounds[1][0];
    const mapW = config.bounds[1][1];

    let mapHtml = `<div style="position: relative; width: 100%; max-width: 800px; margin: 0 auto 20px auto; border: 1px solid #ccc; page-break-inside: avoid;">
        <img src="${config.url}" style="width: 100%; display: block;" alt="Floorplan">`;

    ch.forEach(h => {
        const minLat = Math.min(h.bounds[0].lat, h.bounds[1].lat);
        const maxLat = Math.max(h.bounds[0].lat, h.bounds[1].lat);
        const minLng = Math.min(h.bounds[0].lng, h.bounds[1].lng);
        const maxLng = Math.max(h.bounds[0].lng, h.bounds[1].lng);

        const leftPct = (minLng / mapW) * 100;
        const bottomPct = (minLat / mapH) * 100;
        const widthPct = ((maxLng - minLng) / mapW) * 100;
        const heightPct = ((maxLat - minLat) / mapH) * 100;

        mapHtml += `
        <div style="position: absolute; left: ${leftPct}%; bottom: ${bottomPct}%; width: ${widthPct}%; height: ${heightPct}%; background-color: rgba(255, 235, 59, 0.4); border: 2px solid #ffeb3b; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
            <span style="background: white; color: black; border-radius: 50%; width: 22px; height: 22px; text-align: center; line-height: 22px; font-weight: bold; font-size: 12px; border: 1px solid #333; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">${h.id}</span>
        </div>`;
    });
    mapHtml += `</div>`;

    let reportContent = `
        <div style="font-family: Arial; padding: 20px; max-width: 1000px; margin: 0 auto;">
            <h1 style="border-bottom: 2px solid #ccc; padding-bottom: 10px;">Floor Report: ${currentMapId}</h1>
            <p style="margin-bottom: 20px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            ${mapHtml}
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; page-break-before: auto;">
                <thead>
                    <tr style="background: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 12px; width: 50px;">ID</th>
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Notes & Comments</th>
                    </tr>
                </thead>
                <tbody>`;
                
    ch.forEach(x => {
        reportContent += `<tr><td style="border: 1px solid #ddd; padding: 12px; text-align: center;"><strong>${x.id}</strong></td><td style="border: 1px solid #ddd; padding: 12px;">${x.comment}</td></tr>`;
    });
    reportContent += `</tbody></table></div>`;

    let printContainer = document.getElementById('print-report-container');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-report-container';
        document.body.appendChild(printContainer);

        const style = document.createElement('style');
        style.innerHTML = `
            @media print {
                body > *:not(#print-report-container) { display: none !important; }
                #print-report-container { display: block !important; position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            @media screen {
                #print-report-container { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    printContainer.innerHTML = reportContent;
    
    setTimeout(() => {
        window.print();
    }, 500);
}

function initEditor(mapId, bounds) { 
    currentMapId = mapId; 
    currentMapBounds = bounds; 
    
    // Force View Mode if landing on the overview
    if (mapId === 'overview' && isEditMode) {
        setMode('view');
    }

    resetEditorWorkflow(); 
    measureLayers.clearLayers(); 
    highlightLayers.clearLayers(); 
    highlights = []; 
    highlightCounter = 1;

    // Toggle button availability based on the map
    const btnEdit = document.getElementById('btn-edit');
    const btnReport = document.getElementById('btn-floor-report');

    if (mapId === 'overview') {
        if (btnEdit) {
            btnEdit.disabled = true;
            btnEdit.style.opacity = '0.5';
            btnEdit.style.cursor = 'not-allowed';
            btnEdit.title = 'Edit mode is disabled on the overview map';
        }
        if (btnReport) {
            btnReport.disabled = true;
            btnReport.style.opacity = '0.5';
            btnReport.style.cursor = 'not-allowed';
            btnReport.title = 'Reports are disabled on the overview map';
        }
    } else {
        if (btnEdit) {
            btnEdit.disabled = false;
            btnEdit.style.opacity = '1';
            btnEdit.style.cursor = 'pointer';
            btnEdit.title = '';
        }
        if (btnReport) {
            btnReport.disabled = false;
            btnReport.style.opacity = '1';
            btnReport.style.cursor = 'pointer';
            btnReport.title = '';
        }
    }
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
    document.getElementById(`btn-tool-${tool}`)?.classList.add('active');
    
    const mc = document.getElementById('map');
    if (tool === 'point') {
        mc.style.cursor = 'crosshair';
        if (sidebarForm) sidebarForm.style.display = 'flex';
    } else if (tool === 'measure') {
        mc.style.cursor = 'help';
        if (sidebarForm) sidebarForm.style.display = 'none';
    } else if (tool === 'highlight') {
        mc.style.cursor = 'cell';
        if (sidebarForm) sidebarForm.style.display = 'none';
    }
}

function setMode(mode) {
    if (mode === 'edit' && currentMapId === 'overview') {
        return; // Secondary safety check
    }

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
    if (!isEditMode || currentMapId === 'overview') return;
    
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
    if (!isEditMode || currentMapId === 'overview') return;

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