let isEditMode = false;
let currentMapBounds;
let currentMapId;

let placementState = 'none'; 
let tempMarker; 
let tempLine;   
let sessionMarkers = [];

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const displayX = document.getElementById('display-x');
const displayY = document.getElementById('display-y');
const inputAngle = document.getElementById('edit-angle');
const inputFov = document.getElementById('edit-fov');

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
}

function resetEditorWorkflow() {
    placementState = 'none';
    if (tempMarker) map.removeLayer(tempMarker);
    if (tempLine) map.removeLayer(tempLine);
    displayX.textContent = '--';
    displayY.textContent = '--';
    inputAngle.value = '';
    sidebarForm.reset();
}

// Mode Toggling
function setMode(mode) {
    if (mode === 'edit') {
        isEditMode = true;
        bodyElement.classList.remove('view-mode');
        bodyElement.classList.add('edit-mode');
        document.getElementById('btn-edit').classList.add('active');
        document.getElementById('btn-view').classList.remove('active');
        markerLayer.remove(); 
    } else {
        isEditMode = false;
        bodyElement.classList.remove('edit-mode');
        bodyElement.classList.add('view-mode');
        document.getElementById('btn-view').classList.add('active');
        document.getElementById('btn-edit').classList.remove('active');
        resetEditorWorkflow();
        markerLayer.addTo(map); 
    }
}

document.getElementById('btn-edit').addEventListener('click', () => setMode('edit'));
document.getElementById('btn-view').addEventListener('click', () => setMode('view'));
document.getElementById('btn-cancel').addEventListener('click', resetEditorWorkflow);

// Vector Math
function calculateAngle(latlngA, latlngB) {
    const dx = latlngB.lng - latlngA.lng;
    const dy = latlngB.lat - latlngA.lat; 
    const radians = Math.atan2(dx, dy); 
    let degrees = radians * (180 / Math.PI);
    return Math.round((degrees + 360) % 360);
}

// Map Clicking State Machine
map.on('click', (e) => {
    if (!isEditMode) return;

    if (placementState === 'none') {
        placementState = 'location_placed';
        
        tempMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
        tempMarker.bindPopup('Photo Location (Drag to refine)').openPopup();
        
        displayX.textContent = Math.round(e.latlng.lng);
        displayY.textContent = Math.round(e.latlng.lat);
        
        tempMarker.on('dragend', () => {
             displayX.textContent = Math.round(tempMarker.getLatLng().lng);
             displayY.textContent = Math.round(tempMarker.getLatLng().lat);
             resetVectorStep();
        });

    } else if (placementState === 'location_placed') {
        placementState = 'vector_target_set';
        if (tempLine) map.removeLayer(tempLine);
        
        tempLine = L.polyline([tempMarker.getLatLng(), e.latlng], { color: 'red', dashArray: '5, 10' }).addTo(map);
        inputAngle.value = calculateAngle(tempMarker.getLatLng(), e.latlng);
        
    } else if (placementState === 'vector_target_set') {
        resetVectorStep();
    }
});

function resetVectorStep() {
     placementState = 'location_placed';
     if (tempLine) map.removeLayer(tempLine);
     inputAngle.value = '';
}

// Add Point to Batch
sidebarForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!tempMarker || placementState !== 'vector_target_set') {
        alert("Please place both the location and the target direction vector on the map.");
        return;
    }

    const markerData = {
        session_id: Date.now(),
        map_id: currentMapId,
        type: document.getElementById('edit-type').value,
        x: Math.round(tempMarker.getLatLng().lng),
        y: Math.round(tempMarker.getLatLng().lat),
        orientation: parseInt(inputAngle.value),
        field_of_view: parseInt(inputFov.value),
        url: document.getElementById('edit-url').value,
        title: "New Photo Location" 
    };

    sessionMarkers.push(markerData);
    document.getElementById('session-count').textContent = sessionMarkers.length;

    const finalizedMarker = createDirectionalMarker(
        [markerData.y, markerData.x], 
        markerData.orientation, 
        markerData.field_of_view, 
        markerData.title
    );
    finalizedMarker.session_id = markerData.session_id; 
    finalizedMarker.addTo(markerLayer);

    resetEditorWorkflow();
});

// Download Batch Array
document.getElementById('btn-download-batch').addEventListener('click', () => {
    if (sessionMarkers.length === 0) {
        alert("No points added to the session yet.");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionMarkers, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `map_locations_${Date.now()}.json`);
    
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});