let isEditMode = false;
let currentMapBounds;
let currentMapId;

let placementState = 'none'; 
let tempMarker; 
let tempPolygon; // Replaces the single line
let sessionMarkers = [];
let currentAngle = 0;

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const displayX = document.getElementById('display-x');
const displayY = document.getElementById('display-y');
const displayAngle = document.getElementById('display-angle');
const inputFov = document.getElementById('edit-fov');

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
}

function resetEditorWorkflow() {
    placementState = 'none';
    if (tempMarker) map.removeLayer(tempMarker);
    if (tempPolygon) map.removeLayer(tempPolygon);
    displayX.textContent = '--';
    displayY.textContent = '--';
    displayAngle.textContent = '--';
    sidebarForm.reset();
}

function setMode(mode) {
    isEditMode = (mode === 'edit');
    bodyElement.classList.toggle('edit-mode', isEditMode);
    bodyElement.classList.toggle('view-mode', !isEditMode);
    document.getElementById('btn-edit').classList.toggle('active', isEditMode);
    document.getElementById('btn-view').classList.toggle('active', !isEditMode);
    if (!isEditMode) resetEditorWorkflow();
    // Removed the code that hid the markerLayer, so existing points remain visible
}

document.getElementById('btn-edit').addEventListener('click', () => setMode('edit'));
document.getElementById('btn-view').addEventListener('click', () => setMode('view'));
document.getElementById('btn-cancel').addEventListener('click', resetEditorWorkflow);

// Dynamic Polygon Rendering
function drawDynamicFov(targetLatLng) {
    if (!tempMarker) return;
    if (tempPolygon) map.removeLayer(tempPolygon);

    const center = tempMarker.getLatLng();
    const fov = parseInt(inputFov.value) || 90;
    
    const dx = targetLatLng.lng - center.lng;
    const dy = targetLatLng.lat - center.lat;
    const radius = Math.max(20, Math.sqrt(dx*dx + dy*dy)); // Minimum radius for visibility
    
    let radians = Math.atan2(dx, dy);
    currentAngle = Math.round((radians * 180 / Math.PI + 360) % 360);
    displayAngle.textContent = currentAngle;

    if (fov >= 360) {
        tempPolygon = L.circle(center, { radius: radius, color: '#ffc107', fillOpacity: 0.3, weight: 1, interactive: false }).addTo(map);
        return;
    }

    const halfFov = fov / 2;
    const points = [center];
    for (let a = currentAngle - halfFov; a <= currentAngle + halfFov; a += 5) {
        const rad = a * Math.PI / 180;
        points.push([center.lat + radius * Math.cos(rad), center.lng + radius * Math.sin(rad)]);
    }
    
    tempPolygon = L.polygon(points, { color: '#ffc107', fillOpacity: 0.4, weight: 2, interactive: false }).addTo(map);
}

// Map Event Listeners for Drawing
map.on('click', (e) => {
    if (!isEditMode) return;

    if (placementState === 'none') {
        placementState = 'location_placed';
        
        // Small drafting marker
        tempMarker = L.circleMarker(e.latlng, { radius: 6, color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }).addTo(map);
        
        displayX.textContent = Math.round(e.latlng.lng);
        displayY.textContent = Math.round(e.latlng.lat);
        
    } else if (placementState === 'location_placed') {
        placementState = 'vector_target_set';
        drawDynamicFov(e.latlng); // Finalize polygon
    } else if (placementState === 'vector_target_set') {
        placementState = 'location_placed'; // Allow redrawing vector
    }
});

map.on('mousemove', (e) => {
    if (isEditMode && placementState === 'location_placed') {
        drawDynamicFov(e.latlng);
    }
});

// Update FOV dynamically if input changes while drawing
inputFov.addEventListener('input', () => {
    if (placementState === 'vector_target_set' && tempPolygon) {
        const bounds = tempPolygon.getBounds();
        drawDynamicFov(bounds.getCenter()); // Redraw based on current shape center
    }
});

// Save Point to Session
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

// ... inside sidebarForm.addEventListener('submit', (e) => { ...
    sessionMarkers.push(markerData);
    document.getElementById('session-count').textContent = sessionMarkers.length;

    // UPDATE THIS FUNCTION CALL: Added markerData.url and markerData.type
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

// Download Batch Array
document.getElementById('btn-download-batch').addEventListener('click', () => {
    if (sessionMarkers.length === 0) return alert("No points added to the session yet.");

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionMarkers, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `map_locations_${Date.now()}.json`);
    
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});