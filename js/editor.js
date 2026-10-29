let activeMode = 'view', isEditMode = false;
let currentMapBounds, currentMapId, currentTool = 'point', placementState = 'none';
let tempMarker, tempPolygon, sessionMarkers = [], currentAngle = 0, lastTargetLatLng = null;
let measureStart = null, tempMeasureLine = null;
let highlightStart = null, tempHighlightRect = null, highlights = [], highlightCounter = 1;
let videoStart = null, tempVideoLine = null;

let measureLayers = L.featureGroup();
let highlightLayers = L.featureGroup();

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

// Helper: Convert Hex color to RGBA for transparent report overlays
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Global hook to update highlight data from the side panel
window.updateHighlight = function(id, field, value) {
    const hl = highlights.find(h => h.id === id);
    if (!hl) return;
    if (field === 'color') {
        hl.color = value;
        hl.rect.setStyle({ color: value, fillColor: value });
    } else if (field === 'comment') {
        hl.comment = value;
    }
};

// Renders the highlight manager UI
function renderHighlightManager() {
    const manager = document.getElementById('highlight-manager');
    const list = document.getElementById('highlight-list');
    if (!manager || !list) return;

    const currentHighlights = highlights.filter(h => h.map_id === currentMapId);
    if (currentHighlights.length === 0) {
        manager.style.display = 'none';
        return;
    }

    manager.style.display = 'block';
    list.innerHTML = '';

    currentHighlights.forEach(h => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; background: #fff; padding: 8px; border: 1px solid #ddd; border-radius: 4px;';
        
        // Wrapped the input and dimensions into a flex column to prevent horizontal overflow
        row.innerHTML = `
            <strong style="width: 15px; font-size: 0.9em; flex-shrink: 0;">${h.id}</strong>
            <input type="color" value="${h.color}" onchange="updateHighlight(${h.id}, 'color', this.value)" style="width: 25px; height: 25px; border: none; padding: 0; cursor: pointer; flex-shrink: 0;" title="Change Color">
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px;">
                <input type="text" value="${h.comment}" oninput="updateHighlight(${h.id}, 'comment', this.value)" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 3px; font-size: 0.9em;" placeholder="Zone Label">
                <span style="font-size: 0.75em; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.dimensions}</span>
            </div>
        `;
        list.appendChild(row);
    });
}

function generateFloorReport() {
    if (currentMapId === 'overview') return alert("Floor reports are not available for the overview map.");
    const ch = highlights.filter(h => h.map_id === currentMapId); 
    if (ch.length === 0) return alert("No highlights exist on this floor.");

    const config = mapConfigs[currentMapId];
    
    // --- 1. VECTOR EXPORT (SVG for Adobe Illustrator) ---
    const mapW = config.bounds[1][1];
    const mapH = config.bounds[1][0];
    const absUrl = new URL(config.url, document.baseURI).href; 
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mapW} ${mapH}" width="${mapW}" height="${mapH}">`;
    svg += `<image href="${absUrl}" x="0" y="0" width="${mapW}" height="${mapH}" />`;

    ch.forEach(h => {
        const minLat = Math.min(h.bounds[0].lat, h.bounds[1].lat), maxLat = Math.max(h.bounds[0].lat, h.bounds[1].lat);
        const minLng = Math.min(h.bounds[0].lng, h.bounds[1].lng), maxLng = Math.max(h.bounds[0].lng, h.bounds[1].lng);

        const x = minLng, rectW = maxLng - minLng, rectH = maxLat - minLat;
        const y = mapH - maxLat; 

        const cx = x + rectW / 2, cy = y + rectH / 2;

        svg += `<rect x="${x}" y="${y}" width="${rectW}" height="${rectH}" fill="${h.color}" fill-opacity="0.4" stroke="${h.color}" stroke-width="2" />`;
        svg += `<circle cx="${cx}" cy="${cy}" r="11" fill="white" stroke="#333" stroke-width="1" />`;
        svg += `<text x="${cx}" y="${cy}" font-family="Arial" font-size="12" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="central" alignment-baseline="middle">${h.id}</text>`;
    });
    // --- ADD SCALE BAR TO SVG ---
    if (config.scale) {
        const scalePx = 120 / config.scale; // 120 inches = 10 ft
        const sbX = mapW - scalePx - 30;    // 30px padding from the right edge
        const sbY = mapH - 30;              // 30px padding from the bottom edge
        
        svg += `<g id="scale-bar">`;
        // White background box for contrast
        svg += `<rect x="${sbX - 15}" y="${sbY - 25}" width="${scalePx + 30}" height="40" fill="white" fill-opacity="0.9" rx="4" />`;
        // Scale bar tick marks and line
        svg += `<path d="M ${sbX} ${sbY - 5} L ${sbX} ${sbY} L ${sbX + scalePx} ${sbY} L ${sbX + scalePx} ${sbY - 5}" stroke="#333" stroke-width="3" fill="none" />`;
        // 10 ft text label
        svg += `<text x="${sbX + scalePx / 2}" y="${sbY - 10}" font-family="Arial" font-size="14" font-weight="bold" fill="#333" text-anchor="middle">10 ft</text>`;
        svg += `</g>`;
    }

    svg += `</svg>`;

    // Trigger SVG Download
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vector_Floor_Report_${currentMapId}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // --- 2. AUTOMATIC PDF EXPORT (html2pdf.js) ---
    let mapHtml = `<div style="position: relative; width: 100%; max-width: 800px; margin: 0 auto 20px auto; border: 1px solid #ccc; page-break-inside: avoid;"><img src="${config.url}" style="width: 100%; display: block;">`;

    ch.forEach(h => {
        const minLat = Math.min(h.bounds[0].lat, h.bounds[1].lat), maxLat = Math.max(h.bounds[0].lat, h.bounds[1].lat);
        const minLng = Math.min(h.bounds[0].lng, h.bounds[1].lng), maxLng = Math.max(h.bounds[0].lng, h.bounds[1].lng);
        const bgColor = hexToRgba(h.color, 0.4);
        mapHtml += `<div style="position: absolute; left: ${(minLng / config.bounds[1][1]) * 100}%; bottom: ${(minLat / config.bounds[1][0]) * 100}%; width: ${((maxLng - minLng) / config.bounds[1][1]) * 100}%; height: ${((maxLat - minLat) / config.bounds[1][0]) * 100}%; background-color: ${bgColor}; border: 2px solid ${h.color}; display: flex; align-items: center; justify-content: center; box-sizing: border-box;"><span style="background: white; color: black; border-radius: 50%; width: 22px; height: 22px; text-align: center; line-height: 22px; font-weight: bold; font-size: 12px; border: 1px solid #333; box-shadow: 0 1px 3px rgba(0,0,0,0.5);">${h.id}</span></div>`;
    });
    mapHtml += `</div>`;

    let reportContent = `<div style="font-family: Arial; padding: 20px; max-width: 1000px; margin: 0 auto;"><h1 style="border-bottom: 2px solid #ccc; padding-bottom: 10px;">Floor Report: ${currentMapId}</h1><p style="margin-bottom: 20px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>${mapHtml}<table style="width: 100%; border-collapse: collapse; margin-top: 20px; page-break-before: auto;"><thead><tr style="background: #f2f2f2;"><th style="border: 1px solid #ddd; padding: 12px; width: 50px;">ID</th><th style="border: 1px solid #ddd; padding: 12px; width: 150px;">Dimensions</th><th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Notes</th></tr></thead><tbody>`;
    ch.forEach(x => reportContent += `<tr><td style="border: 1px solid #ddd; padding: 12px; text-align: center; background-color: ${hexToRgba(x.color, 0.2)};"><strong>${x.id}</strong></td><td style="border: 1px solid #ddd; padding: 12px; text-align: center;">${x.dimensions}</td><td style="border: 1px solid #ddd; padding: 12px;">${x.comment}</td></tr>`);
    reportContent += `</tbody></table></div>`;

    // Create a temporary off-screen container for html2pdf
    let printContainer = document.createElement('div');
    printContainer.innerHTML = reportContent;

    if (typeof html2pdf !== 'undefined') {
        const opt = {
            margin:       0.5,
            filename:     `Floor_Report_${currentMapId}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        // Generate and download the PDF
        html2pdf().set(opt).from(printContainer).save();
    } else {
        alert("PDF generator library is not loaded. Please ensure html2pdf.js is included in your index.html.");
    }
}

function initEditor(mapId, bounds) { 
    currentMapId = mapId; 
    currentMapBounds = bounds; 
    
    // Always default to 'view' mode when loading or switching floors
    setMode('view');
    resetEditorWorkflow(); 
    
    measureLayers.clearLayers(); 
    highlightLayers.clearLayers(); 

    // Re-display existing highlights for the selected floor
    highlights.filter(h => h.map_id === currentMapId).forEach(h => {
        h.rect.addTo(highlightLayers);
        h.label.addTo(highlightLayers);
    });

    const floorHighlights = highlights.filter(h => h.map_id === currentMapId);
    highlightCounter = floorHighlights.length > 0 ? Math.max(...floorHighlights.map(h => h.id)) + 1 : 1;

    renderHighlightManager();

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
    currentTool = tool; 
    resetEditorWorkflow();
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-tool-${tool}`)?.classList.add('active');
    
    const mc = document.getElementById('map');
    const form = document.getElementById('editor-form');
    const dataGroup = document.getElementById('data-group');
    const dataDivider = document.getElementById('data-divider');
    const reportGroup = document.getElementById('report-group');

    if (tool === 'point') {
        mc.style.cursor = 'crosshair';
        if (dataGroup) dataGroup.style.display = 'block';
        if (form) form.style.display = 'flex';
        if (dataDivider) dataDivider.style.display = 'block';
        if (reportGroup) reportGroup.style.display = 'none';
    } else if (tool === 'video') {
        mc.style.cursor = 'crosshair';
        if (dataGroup) dataGroup.style.display = 'block';
        if (form) form.style.display = 'none';
        if (dataDivider) dataDivider.style.display = 'none';
        if (reportGroup) reportGroup.style.display = 'none';
    } else if (tool === 'measure' || tool === 'highlight') {
        mc.style.cursor = (tool === 'measure') ? 'help' : 'cell';
        if (dataGroup) dataGroup.style.display = 'none';
        if (reportGroup) reportGroup.style.display = 'block';
    }
}

function setMode(mode) {
    if (mode !== 'view' && currentMapId === 'overview') return alert("Editing is not available on the overview map.");
    
    activeMode = mode;
    isEditMode = (mode !== 'view'); // CRITICAL FIX: Re-enables map click events
    
    bodyElement.classList.toggle('edit-mode', isEditMode); 
    bodyElement.classList.toggle('view-mode', !isEditMode);
    bodyElement.classList.toggle('layout-mode', mode === 'layout');
    bodyElement.classList.toggle('point-mode', mode === 'point');

    document.getElementById('btn-view')?.classList.toggle('active', mode === 'view');
    document.getElementById('btn-layout-edit')?.classList.toggle('active', mode === 'layout');
    document.getElementById('btn-point-edit')?.classList.toggle('active', mode === 'point');
    
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);

    if (mode === 'view') {
        resetEditorWorkflow();
    } else if (mode === 'layout') {
        setTool('highlight'); 
    } else if (mode === 'point') {
        setTool('point'); 
    }
}

function formatDistance(px) { return `${Math.floor((px * (mapConfigs[currentMapId]?.scale || 1)) / 12)}' ${Math.round((px * (mapConfigs[currentMapId]?.scale || 1)) % 12)}"`; }

// Corrected Dynamic FOV Drawing Loop
function drawDynamicFov(tll) {
    if (!tempMarker || !tll) return; 
    if (tempPolygon) map.removeLayer(tempPolygon);
    
    const c = tempMarker.getLatLng();
    const dx = tll.lng - c.lng;
    const dy = tll.lat - c.lat;
    const rad = Math.max(30, Math.sqrt(dx * dx + dy * dy));
    
    // Direct angle calculation
    const rawAngle = Math.atan2(-dy, dx) * (180 / Math.PI);
    currentAngle = Math.round((rawAngle + 360) % 360);

    if (parseInt(inputFov.value) >= 360) {
        tempPolygon = L.circle(c, { radius: rad, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
        return;
    }

    const pts = [c];
    const halfFov = parseInt(inputFov.value) / 2;
    for (let a = currentAngle - halfFov; a <= currentAngle + halfFov; a += 2) {
        const radAngle = -a * (Math.PI / 180);
        // Corrected mapping: Latitude (y) uses cos, Longitude (x) uses sin for proper screen tracking
        pts.push([
            c.lat + rad * Math.sin(radAngle), 
            c.lng + rad * Math.cos(radAngle)
        ]);
    }
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
            const bounds = [highlightStart, e.latlng];
            const id = highlightCounter++;
            const defaultColor = "#ffeb3b";
            
            const wPx = Math.abs(e.latlng.lng - highlightStart.lng);
            const hPx = Math.abs(e.latlng.lat - highlightStart.lat);
            const dims = `${formatDistance(wPx)} x ${formatDistance(hPx)}`;

            const rect = L.rectangle(bounds, { color: defaultColor, weight: 1, fillOpacity: 0.1, fillColor: defaultColor }).addTo(highlightLayers);
            const label = L.marker(rect.getBounds().getCenter(), { 
                icon: L.divIcon({ 
                    className: 'highlight-label', 
                    iconSize: [22, 22],      /* NEW: Define the exact size */
                    iconAnchor: [11, 11],    /* NEW: Anchor it dead-center (half of 22) */
                    html: `<div style="background:white; color:black; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-weight:bold; border:1px solid #333; font-size:12px;">${id}</div>` 
                }) 
            }).addTo(highlightLayers);
            
            highlights.push({ id, bounds, comment: `Zone ${id}`, color: defaultColor, dimensions: dims, map_id: currentMapId, rect, label });
            
            rect.on('click', function(evt) { 
                L.DomEvent.stop(evt); 
                if (confirm("Delete this highlight?")) { 
                    highlightLayers.removeLayer(rect); 
                    highlightLayers.removeLayer(label); 
                    highlights = highlights.filter(h => h.id !== id); 
                    renderHighlightManager();
                } 
            });
            
            highlightStart = null; 
            if (tempHighlightRect) map.removeLayer(tempHighlightRect);
            renderHighlightManager();
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