// ============================================
// GARMENT INTAKE — Application Logic
// ============================================

(function () {
  'use strict';

  // ---- STATE ----
  const STATES = {
    GARMENT_SCAN: 1,
    DAMAGE_CAPTURE: 2,
    CARE_LABEL: 3,
    COMPLETE: 4,
  };

  let currentState = STATES.GARMENT_SCAN;
  let detectionCount = 0; // consecutive positive detections for stability
  let isProcessing = false; // prevent overlapping API calls
  let scanInterval = null;

  // Current garment data
  let currentGarment = createEmptyGarment();

  // Order list
  let order = [];

  // ---- DOM REFS ----
  const cameraFeed = document.getElementById('cameraFeed');
  const captureCanvas = document.getElementById('captureCanvas');
  const cameraSelect = document.getElementById('cameraSelect');
  const statePrompt = document.getElementById('statePrompt');
  const detectionIndicator = document.getElementById('detectionIndicator');
  const flashOverlay = document.getElementById('flashOverlay');
  const damageControls = document.getElementById('damageControls');
  const completeControls = document.getElementById('completeControls');
  const btnCaptureDamage = document.getElementById('btnCaptureDamage');
  const btnSkipDamage = document.getElementById('btnSkipDamage');
  const btnAddToOrder = document.getElementById('btnAddToOrder');
  const btnNewGarment = document.getElementById('btnNewGarment');
  const damageList = document.getElementById('damageList');
  const orderList = document.getElementById('orderList');
  const orderCount = document.getElementById('orderCount');
  const orderPlaceholder = document.getElementById('orderPlaceholder');
  const brackets = document.querySelectorAll('.bracket');

  // Field refs
  const fields = {
    type: document.getElementById('fieldType'),
    color: document.getElementById('fieldColor'),
    brand: document.getElementById('fieldBrand'),
    fiber: document.getElementById('fieldFiber'),
    dryClean: document.getElementById('fieldDryClean'),
    washing: document.getElementById('fieldWashing'),
    drying: document.getElementById('fieldDrying'),
    ironing: document.getElementById('fieldIroning'),
    bleaching: document.getElementById('fieldBleaching'),
    prefs: document.getElementById('fieldPrefs'),
  };

  // Field groups
  const groups = {
    garment: document.getElementById('groupGarment'),
    damage: document.getElementById('groupDamage'),
    care: document.getElementById('groupCare'),
    prefs: document.getElementById('groupPrefs'),
  };

  // State dots
  const stateDots = document.querySelectorAll('.state-dot');

  // ---- HELPERS ----

  function createEmptyGarment() {
    return {
      garmentType: '',
      color: '',
      brand: '',
      fiberContent: '',
      dryClean: '',
      washing: '',
      drying: '',
      ironing: '',
      bleaching: '',
      damages: [],
      preferences: '',
    };
  }

  function captureFrame() {
    const ctx = captureCanvas.getContext('2d');
    captureCanvas.width = cameraFeed.videoWidth;
    captureCanvas.height = cameraFeed.videoHeight;
    ctx.drawImage(cameraFeed, 0, 0);
    // Return base64 without the data:image/jpeg;base64, prefix
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  }

  function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(() => flashOverlay.classList.remove('flash'), 200);
  }

  function setBracketState(state) {
    brackets.forEach((b) => {
      b.classList.remove('detecting', 'captured');
      if (state) b.classList.add(state);
    });
  }

  function setDetectionText(text) {
    detectionIndicator.textContent = text;
    detectionIndicator.classList.toggle('visible', !!text);
  }

  function setFieldValue(field, value) {
    if (value && value !== 'Not visible' && value !== 'Not specified') {
      field.value = value;
      field.classList.add('populated');
    }
  }

  function clearAllFields() {
    Object.values(fields).forEach((f) => {
      f.value = '';
      f.classList.remove('populated');
    });
    damageList.innerHTML = '<p class="placeholder-text">No damage recorded</p>';
  }

  function highlightGroup(groupName) {
    Object.values(groups).forEach((g) => {
      g.classList.remove('highlight');
    });
    if (groupName && groups[groupName]) {
      groups[groupName].classList.add('highlight');
    }
  }

  function markGroupComplete(groupName) {
    if (groups[groupName]) {
      groups[groupName].classList.remove('highlight');
      groups[groupName].classList.add('complete');
    }
  }

  function resetGroups() {
    Object.values(groups).forEach((g) => {
      g.classList.remove('highlight', 'complete');
    });
  }

  // ---- STATE MACHINE ----

  function transitionTo(state) {
    currentState = state;
    detectionCount = 0;
    isProcessing = false;
    setBracketState(null);
    setDetectionText('');

    // Update state dots
    stateDots.forEach((dot) => {
      const s = parseInt(dot.dataset.state);
      dot.classList.remove('active', 'done');
      if (s < state) dot.classList.add('done');
      if (s === state) dot.classList.add('active');
    });

    // Hide all contextual controls
    damageControls.classList.add('hidden');
    completeControls.classList.add('hidden');

    switch (state) {
      case STATES.GARMENT_SCAN:
        statePrompt.textContent = 'Place garment in frame';
        highlightGroup('garment');
        startAutoScan();
        break;

      case STATES.DAMAGE_CAPTURE:
        statePrompt.textContent = 'Any damage? Hold it to camera, or skip';
        highlightGroup('damage');
        damageControls.classList.remove('hidden');
        stopAutoScan();
        break;

      case STATES.CARE_LABEL:
        statePrompt.textContent = 'Show care label to camera';
        highlightGroup('care');
        startAutoScan();
        break;

      case STATES.COMPLETE:
        statePrompt.textContent = 'Review and confirm';
        highlightGroup(null);
        completeControls.classList.remove('hidden');
        stopAutoScan();
        // Mark all groups complete
        markGroupComplete('garment');
        markGroupComplete('damage');
        markGroupComplete('care');
        setBracketState('captured');
        break;
    }
  }

  // ---- AUTO-SCAN LOOP ----

  function startAutoScan() {
    stopAutoScan();
    scanInterval = setInterval(autoScanTick, 2000);
  }

  function stopAutoScan() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  }

  async function autoScanTick() {
    if (isProcessing) return;
    if (cameraFeed.videoWidth === 0) return;

    const image = captureFrame();
    const mode =
      currentState === STATES.GARMENT_SCAN ? 'garment' : 'label';

    isProcessing = true;
    setDetectionText('Scanning...');

    try {
      const resp = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mode }),
      });

      const result = await resp.json();

      if (!resp.ok) {
        console.error('Detection API error:', result.error);
        setDetectionText(result.error || 'API error');
        detectionIndicator.classList.add('error');
        detectionCount = 0;
        return;
      }

      detectionIndicator.classList.remove('error');

      if (result.detected) {
        detectionCount++;
        setBracketState('detecting');
        setDetectionText(
          `Detected (${detectionCount}/2)`
        );

        // Require 2 consecutive detections for stability
        if (detectionCount >= 2) {
          setDetectionText('Capturing...');
          await performCapture(image);
        }
      } else {
        detectionCount = 0;
        setBracketState(null);
        setDetectionText('Watching...');
      }
    } catch (err) {
      console.error('Auto-scan error:', err);
      setDetectionText('Network error — retrying...');
      detectionIndicator.classList.add('error');
      detectionCount = 0;
    } finally {
      isProcessing = false;
    }
  }

  async function performCapture(image) {
    stopAutoScan();
    triggerFlash();
    setBracketState('captured');

    if (currentState === STATES.GARMENT_SCAN) {
      await analyzeGarment(image);
    } else if (currentState === STATES.CARE_LABEL) {
      await analyzeLabel(image);
    }
  }

  // ---- ANALYSIS FUNCTIONS ----

  async function analyzeGarment(image) {
    setDetectionText('Analyzing garment...');
    statePrompt.innerHTML = '<span class="spinner"></span> Analyzing garment...';

    try {
      const resp = await fetch('/api/analyze/garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Garment analysis failed');

      currentGarment.garmentType = data.garmentType || '';
      currentGarment.color = data.color || '';
      currentGarment.brand = data.brand || '';

      setFieldValue(fields.type, data.garmentType);
      setFieldValue(fields.color, data.color);
      setFieldValue(fields.brand, data.brand);

      markGroupComplete('garment');
      transitionTo(STATES.DAMAGE_CAPTURE);
    } catch (err) {
      console.error('Garment analysis error:', err);
      statePrompt.textContent = err.message || 'Analysis failed — retrying...';
      detectionCount = 0;
      startAutoScan();
    }
  }

  async function analyzeDamage(image) {
    isProcessing = true;
    statePrompt.innerHTML = '<span class="spinner"></span> Analyzing damage...';
    btnCaptureDamage.disabled = true;

    try {
      const resp = await fetch('/api/analyze/damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Damage analysis failed');

      const timestamp = new Date().toLocaleTimeString();
      const damageEntry = {
        timestamp,
        type: data.type || 'Unknown',
        location: data.location || '',
        severity: data.severity || '',
        description: data.description || '',
      };

      currentGarment.damages.push(damageEntry);
      renderDamageEntry(damageEntry);
      triggerFlash();

      statePrompt.textContent =
        'Damage recorded. Capture more or skip.';
    } catch (err) {
      console.error('Damage analysis error:', err);
      statePrompt.textContent = err.message || 'Damage capture failed. Try again or skip.';
    } finally {
      isProcessing = false;
      btnCaptureDamage.disabled = false;
    }
  }

  function renderDamageEntry(entry) {
    // Remove placeholder if present
    const placeholder = damageList.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = 'damage-entry';
    div.innerHTML = `
      <div class="damage-time">${entry.timestamp} — ${entry.severity} ${entry.type}</div>
      <div class="damage-desc">${entry.location ? entry.location + ': ' : ''}${entry.description}</div>
    `;
    damageList.appendChild(div);
  }

  async function analyzeLabel(image) {
    setDetectionText('Reading care label...');
    statePrompt.innerHTML = '<span class="spinner"></span> Reading care label...';

    try {
      const resp = await fetch('/api/analyze/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Label analysis failed');

      currentGarment.fiberContent = data.fiberContent || '';
      currentGarment.dryClean = data.dryClean || '';
      currentGarment.washing = data.washing || '';
      currentGarment.drying = data.drying || '';
      currentGarment.ironing = data.ironing || '';
      currentGarment.bleaching = data.bleaching || '';

      setFieldValue(fields.fiber, data.fiberContent);
      setFieldValue(fields.dryClean, data.dryClean);
      setFieldValue(fields.washing, data.washing);
      setFieldValue(fields.drying, data.drying);
      setFieldValue(fields.ironing, data.ironing);
      setFieldValue(fields.bleaching, data.bleaching);

      markGroupComplete('care');
      transitionTo(STATES.COMPLETE);
    } catch (err) {
      console.error('Label analysis error:', err);
      statePrompt.textContent = err.message || 'Label read failed — retrying...';
      detectionCount = 0;
      startAutoScan();
    }
  }

  // ---- ORDER MANAGEMENT ----

  function addToOrder() {
    // Read current field values (staff may have edited them)
    currentGarment.garmentType = fields.type.value;
    currentGarment.color = fields.color.value;
    currentGarment.brand = fields.brand.value;
    currentGarment.fiberContent = fields.fiber.value;
    currentGarment.dryClean = fields.dryClean.value;
    currentGarment.washing = fields.washing.value;
    currentGarment.drying = fields.drying.value;
    currentGarment.ironing = fields.ironing.value;
    currentGarment.bleaching = fields.bleaching.value;
    currentGarment.preferences = fields.prefs.value;

    order.push({ ...currentGarment });
    renderOrderCard(currentGarment, order.length);
    updateOrderCount();
  }

  function renderOrderCard(garment, index) {
    if (orderPlaceholder) orderPlaceholder.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'order-card';

    let tagsHtml = '';
    if (garment.fiberContent) {
      tagsHtml += `<span class="card-tag">${escapeHtml(garment.fiberContent)}</span>`;
    }
    if (garment.dryClean && garment.dryClean !== 'Not specified') {
      tagsHtml += `<span class="card-tag">${escapeHtml(garment.dryClean)}</span>`;
    }
    if (garment.damages.length > 0) {
      tagsHtml += `<span class="card-tag damage">${garment.damages.length} damage note${garment.damages.length > 1 ? 's' : ''}</span>`;
    }
    if (garment.preferences) {
      tagsHtml += `<span class="card-tag">${escapeHtml(garment.preferences)}</span>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <span class="card-number">#${index}</span>
      </div>
      <div class="card-title">${escapeHtml(garment.color)} ${escapeHtml(garment.garmentType)}</div>
      ${garment.brand && garment.brand !== 'Not visible' ? `<div class="card-detail">${escapeHtml(garment.brand)}</div>` : ''}
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
    `;

    orderList.appendChild(card);
  }

  function updateOrderCount() {
    orderCount.textContent = `(${order.length} item${order.length !== 1 ? 's' : ''})`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function resetForNewGarment() {
    currentGarment = createEmptyGarment();
    clearAllFields();
    resetGroups();
    transitionTo(STATES.GARMENT_SCAN);
  }

  // ---- CAMERA SETUP ----

  async function enumerateCameras() {
    try {
      // Request permission first to get labeled devices
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      cameraSelect.innerHTML = '';
      videoDevices.forEach((device, i) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${i + 1}`;
        cameraSelect.appendChild(option);
      });

      // Default to the last camera (usually the dedicated USB camera)
      if (videoDevices.length > 0) {
        cameraSelect.value = videoDevices[videoDevices.length - 1].deviceId;
      }

      return videoDevices;
    } catch (err) {
      console.error('Camera enumeration failed:', err);
      statePrompt.textContent = 'Camera access denied or unavailable';
      return [];
    }
  }

  async function startCamera(deviceId) {
    // Stop any existing stream
    if (cameraFeed.srcObject) {
      cameraFeed.srcObject.getTracks().forEach((t) => t.stop());
    }

    try {
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraFeed.srcObject = stream;
      await cameraFeed.play();
    } catch (err) {
      console.error('Camera start failed:', err);
      statePrompt.textContent = 'Failed to start camera';
    }
  }

  // ---- EVENT LISTENERS ----

  cameraSelect.addEventListener('change', () => {
    startCamera(cameraSelect.value);
  });

  btnCaptureDamage.addEventListener('click', () => {
    if (isProcessing) return;
    if (cameraFeed.videoWidth === 0) return;
    const image = captureFrame();
    analyzeDamage(image);
  });

  btnSkipDamage.addEventListener('click', () => {
    markGroupComplete('damage');
    transitionTo(STATES.CARE_LABEL);
  });

  btnAddToOrder.addEventListener('click', () => {
    addToOrder();
    resetForNewGarment();
  });

  btnNewGarment.addEventListener('click', () => {
    resetForNewGarment();
  });

  // ---- INIT ----

  async function init() {
    statePrompt.textContent = 'Initializing camera...';

    const cameras = await enumerateCameras();
    if (cameras.length === 0) {
      statePrompt.textContent = 'No cameras found';
      return;
    }

    await startCamera(cameraSelect.value);

    // Wait for video to be ready
    cameraFeed.addEventListener('loadeddata', () => {
      transitionTo(STATES.GARMENT_SCAN);
    }, { once: true });

    // Fallback if loadeddata already fired
    if (cameraFeed.readyState >= 2) {
      transitionTo(STATES.GARMENT_SCAN);
    }
  }

  init();
})();
