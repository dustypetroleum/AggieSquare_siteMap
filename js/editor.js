let isEditMode = false;
let currentMapBounds;
let currentMapId;

// State Machine Variables
let currentTool = 'point'; // 'point', 'measure', 'highlight'
let placementState = 'none';

// Point Tool Variables
let tempMarker; 
let tempPolygon; 
let sessionMarkers = [];
let currentAngle = 0;
let lastTargetLatLng = null;

// Measure & Highlight Variables
let measureStart = null;
let tempMeasureLine = null;
let highlightStart = null;
let tempHighlightRect = null;
let highlights = []; // Stores highlight data for the report

// Layer Groups for easy clearing
let measureLayers = L.featureGroup();
let highlightLayers = L.featureGroup();

const bodyElement = document.body;
const sidebarForm = document.getElementById('editor-form');
const inputFov = document.getElementById('edit-fov');

// Add editor layers to the map
document.addEventListener('DOMContentLoaded', () => {
    measureLayers.addTo(map);
    highlightLayers.addTo(map);
});

function initEditor(mapId, bounds) {
    currentMapId = mapId;
    currentMapBounds = bounds;
    resetEditorWorkflow();
    // Optional: Clear highlights and measurements when changing floors
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

// Tool Switching Logic
function setTool(tool) {
    currentTool = tool;
    resetEditorWorkflow();

    // Update button visuals (assuming you add these IDs to your HTML)
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-tool-${tool}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Change map cursor based on tool
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
    else setTool('point'); // Default to point tool when entering edit mode
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

    // Floor Report Generator
    if (btnReport) btnReport.addEventListener('click', generateFloorReport);

    // Form Submission (Point Tool)
    if (sidebarForm) {
        sidebarForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!tempMarker || placementState !== 'vector_target_set') {
                alert("Please place the location and click again to set the direction.");
                return;
            }

            const urlVal = document.getElementById('edit-url').value.toLowerCase();
            if (urlVal.endsWith('.heic')) {
                alert("Warning: .HEIC files are not supported by browsers. Please convert to .JPG or .PNG.");
                return; 
            }

            const markerData = {
                session_id: Date.now(),
                map_id: currentMapId,
                title: document.getElementById('edit-title').value,
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

// Helper: Format Pixels to Feet/Inches
function formatDistance(pixels) {
    // Access scale from global mapConfigs. Fallback to 1 if missing.
    const scale = mapConfigs[currentMapId]?.scale || 1; 
    const totalInches = pixels * scale;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}' ${inches}"`;
}

// Map Click Logic Routing
map.on('click', (e) => {
    if (!isEditMode) return;

    if (currentTool === 'point') {
        if (placementState === 'none') {
            placementState = 'location_placed';
            tempMarker = L.circleMarker(e.latlng, { radius: 6, color: '#28a745', fillColor: '#28a745', fillOpacity: 1 }).addTo(map);
        }