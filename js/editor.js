let isEditMode = false;
let currentMapBounds;
let currentMapId;

let placementState = 'none';
let tempMarker; 
let tempPolygon; 
let sessionMarkers = [];
let currentAngle = 0;
let lastTargetLatLng = null;

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
}

function resetEditorWorkflow() {
    placementState = 'none';
    lastTargetLatLng = null;
    if (tempMarker) map.removeLayer(tempMarker);
    if (tempPolygon) map.removeLayer(tempPolygon);
    if (sidebarForm) sidebarForm.reset();
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
}

document.addEventListener('DOMContentLoaded', () => {
    const btnEdit = document.getElementById('btn-edit');
    const btnView = document.getElementById('btn-view');
    const btnCancel = document.getElementById('btn-cancel');
    const btnDownload = document.getElementById('btn-download-batch');

    if (btnEdit) btnEdit.addEventListener('click', () => setMode('edit'));
    if (btnView) btnView.addEventListener('click', () => setMode('view'));
    if (btnCancel) btnCancel.addEventListener('click', resetEditorWorkflow);

    if (sidebarForm) {
        sidebarForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!tempMarker || placementState !== 'vector_target_set') {
                alert("Please place the location and click again to set the direction.");
                return;
            }

            const titleVal = document.getElementById('edit-title').value;

            const markerData = {
                session_id: Date.now(),
                map_id: currentMapId,
                title: titleVal,
                comments: document.getElementById('edit-comments').value,
                type: document.getElementById('edit-type').value,
                x: Math.round(tempMarker.getLatLng().lng),
                y: Math.round(tempMarker.getLatLng().lat),
                orientation: currentAngle,
                field_of_view: parseInt(inputFov.value),
                url: document.getElementById('edit-url').value
            };

            sessionMarkers.push(markerData);
            const countEl = document.getElementById('session-count');
            if (countEl) countEl.textContent = sessionMarkers.length;

            const finalizedMarker = createDirectionalMarker(
                [markerData.y, markerData.x], 
                markerData.orientation, 
                markerData.field_of_view, 
                markerData.title,
                markerData.comments,
                markerData.url,
                markerData.type
            );
            finalizedMarker.session_id = markerData.session_id; 
            finalizedMarker.addTo(markerLayer);

            resetEditorWorkflow();
        });
    }

    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            if (sessionMarkers.length === 0) return alert("No points added to the session yet.");

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

function drawDynamicFov(targetLatLng) {
    if (!tempMarker || !targetLatLng) return;
    if (tempPolygon) map.removeLayer(tempPolygon);

    const center = tempMarker.getLatLng();
    const fov = parseInt(inputFov.value) || 90;
    
    const dx = targetLatLng.lng - center.lng;
    const dy = targetLatLng.lat - center.lat;
    const radius = Math.max(30, Math.sqrt(dx*dx + dy*dy)); 
    
    let radians = Math.atan2(dx, dy);
    currentAngle = Math.round((radians * 180 / Math.PI + 360) % 360);

    if (fov >= 360) {
        tempPolygon = L.circle(center, { radius: radius, color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
        return;
    }

    const halfFov = fov / 2;
    const points = [center];
    
    for (let a = currentAngle - halfFov; a <= currentAngle + halfFov; a += 2) {
        const rad = a * Math.PI / 180;
        points.push([center.lat + radius * Math.cos(rad), center.lng + radius * Math.sin(rad)]);
    }
    
    tempPolygon = L.polygon(points, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}

map.on('click', (e) => {
    if (!isEditMode) return;

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
});

map.on('mousemove', (e) => {
    if (isEditMode && placementState === 'location_placed') {
        lastTargetLatLng = e.latlng;
        drawDynamicFov(lastTargetLatLng);
    }
});

if (inputFov) {
    inputFov.addEventListener('input', () => {
        if ((placementState === 'location_placed' || placementState === 'vector_target_set') && lastTargetLatLng) {
            drawDynamicFov(lastTargetLatLng); 
        }
    });
}
