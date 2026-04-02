let isEditMode = false;
let currentMapBounds;
let currentMapId;

// State management for vector drawing
let placementState = 'none'; // none -> location_placed -> vector_target_set
let tempMarker; // The photo location
let tempLine;   // The temporary vector line

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');

// Inputs/Display elements
const displayX = document.getElementById('display-x');
const displayY = document.getElementById('display-y');
const inputAngle = document.getElementById('edit-angle');
const inputFov = document.getElementById('edit-fov');

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
}

// Workflow Reset
function resetEditorWorkflow() {
    placementState = 'none';
    if (tempMarker) map.removeLayer(tempMarker);
    if (tempLine) map.removeLayer(tempLine);
    displayX.textContent = '--';
    displayY.textContent = '--';
    inputAngle.value = '';
    sidebarForm.reset();
}

// Toggle logic
function setMode(mode) {
    if (mode === 'edit') {
        isEditMode = true;
        bodyElement.classList.remove('view-mode');
        bodyElement.classList.add('edit-mode');
        document.getElementById('btn-edit').classList.add('active');
        document.getElementById('btn-view').classList.remove('active');
        markerLayer.remove(); // Hide view markers while editing
    } else {
        isEditMode = false;
        bodyElement.classList.remove('edit-mode');
        bodyElement.classList.add('view-mode');
        document.getElementById('btn-view').classList.add('active');
        document.getElementById('btn-edit').classList.remove('active');
        resetEditorWorkflow();
        markerLayer.addTo(map); // Show view markers
    }
}

document.getElementById('btn-edit').addEventListener('click', () => setMode('edit'));
document.getElementById('btn-view').addEventListener('click', () => setMode('view'));

// Vector Calculation (Point A [location] to Point B [target])
function calculateAngle(latlngA, latlngB) {
    const dx = latlngB.lng - latlngA.lng;
    const dy = latlngB.lat - latlngA.lat; // Leaflet coordinates use (y, x)
    
    // Math.atan2 returns radians relative to the x-axis. 
    // We adjust it for compass-style bearings (0° North).
    const radians = Math.atan2(dx, dy); 
    let degrees = radians * (180 / Math.PI);
    
    // Normalize to 0-360
    degrees = (degrees + 360) % 360;
    
    return Math.round(degrees);
}

// Map Click Interaction (State Machine)
map.on('click', (e) => {
    if (!isEditMode) return;

    if (placementState === 'none') {
        // Step 1: Place Location Marker
        placementState = 'location_placed';
        
        // Capture [y, x] pixel coordinates
        tempMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
        tempMarker.bindPopup('Photo Location (Drag to refine)').openPopup();
        
        displayX.textContent = Math.round(e.latlng.lng);
        displayY.textContent = Math.round(e.latlng.lat);
        
        // Listen for refinement drag
        tempMarker.on('dragend', () => {
             displayX.textContent = Math.round(tempMarker.getLatLng().lng);
             displayY.textContent = Math.round(tempMarker.getLatLng().lat);
             resetVectorStep();
        });

    } else if (placementState === 'location_placed') {
        // Step 2: Click again to define target vector
        placementState = 'vector_target_set';
        
        if (tempLine) map.removeLayer(tempLine);
        
        // Draw the visual vector line from A to B
        tempLine = L.polyline([tempMarker.getLatLng(), e.latlng], { color: 'red', dashArray: '5, 10' }).addTo(map);
        
        // Calculate the angle
        const angle = calculateAngle(tempMarker.getLatLng(), e.latlng);
        inputAngle.value = angle;
        
    } else if (placementState === 'vector_target_set') {
        // Re-clicking map resets vector definition phase
        resetVectorStep();
    }
});

function resetVectorStep() {
     placementState = 'location_placed';
     if (tempLine) map.removeLayer(tempLine);
     inputAngle.value = '';
}

// 5. Data Export (Saving)Workflow
sidebarForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!tempMarker || placementState !== 'vector_target_set') {
        alert("Please place both the location and the target direction vector on the map.");
        return;
    }

    // Compile the final data point
    const markerData = {
        map_id: currentMapId,
        type: document.getElementById('edit-type').value,
        x: Math.round(tempMarker.getLatLng().lng),
        y: Math.round(tempMarker.getLatLng().lat),
        orientation: parseInt(inputAngle.value),
        field_of_view: parseInt(inputFov.value),
        url: document.getElementById('edit-url').value,
        title: "New Photo Location" // Allow user to edit this too
    };

    // Output the JSON snippet so the user can copy/paste it into data/locations.json
    console.log("MARKER DATA JSON:");
    console.log(JSON.stringify(markerData, null, 2));
    alert("Data output to console. Copy the JSON snippet there and paste it into data/locations.json.");
// Cancel button listener
document.getElementById('btn-cancel').addEventListener('click', () => {
    resetEditorWorkflow();
});

});