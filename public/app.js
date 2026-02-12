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
  let stabilityScore = 0; // 0-100 rolling confidence
  let isProcessing = false;
  let scanInterval = null;
  let processingTextInterval = null;

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
  const btnBack = document.getElementById('btnBack');
  const damageList = document.getElementById('damageList');
  const orderList = document.getElementById('orderList');
  const orderCount = document.getElementById('orderCount');
  const orderPlaceholder = document.getElementById('orderPlaceholder');
  const brackets = document.querySelectorAll('.bracket');
  const stabilityMeter = document.getElementById('stabilityMeter');
  const stabilityFill = document.getElementById('stabilityFill');
  const stabilityText = document.getElementById('stabilityText');

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

  // ---- AUDIO FEEDBACK ----

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playTone(freq, duration, volume, startDelay) {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + (startDelay || 0);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    } catch (e) {
      // Audio not available, silently ignore
    }
  }

  function playDetectionTick() {
    playTone(600, 0.06, 0.06, 0);
  }

  function playCaptureSound() {
    playTone(880, 0.12, 0.1, 0);
    playTone(1100, 0.15, 0.12, 0.1);
  }

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
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  }

  function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(() => flashOverlay.classList.remove('flash'), 200);
  }

  function setBracketState(state) {
    brackets.forEach((b) => {
      b.classList.remove('detecting', 'locking', 'captured');
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

  // ---- STABILITY METER ----

  function updateStabilityMeter() {
    const pct = Math.min(100, Math.max(0, stabilityScore));
    stabilityFill.style.width = pct + '%';

    // Color coding
    stabilityFill.classList.remove('low', 'medium', 'high');
    if (pct >= 70) {
      stabilityFill.classList.add('high');
    } else if (pct >= 30) {
      stabilityFill.classList.add('medium');
    } else {
      stabilityFill.classList.add('low');
    }

    // Text label
    if (pct >= 85) {
      stabilityText.textContent = 'READY TO CAPTURE';
    } else if (pct >= 50) {
      stabilityText.textContent = 'HOLD STEADY';
    } else if (pct > 0) {
      stabilityText.textContent = 'SEARCHING';
    } else {
      stabilityText.textContent = '';
    }
  }

  function showStabilityMeter() {
    stabilityMeter.classList.add('visible');
  }

  function hideStabilityMeter() {
    stabilityMeter.classList.remove('visible');
    stabilityScore = 0;
    updateStabilityMeter();
  }

  // ---- PROGRESSIVE PROCESSING TEXT ----

  function startProgressiveText(texts) {
    let idx = 0;
    stopProgressiveText();
    statePrompt.innerHTML = '<span class="spinner"></span> ' + texts[0];
    processingTextInterval = setInterval(() => {
      idx++;
      if (idx < texts.length) {
        statePrompt.innerHTML = '<span class="spinner"></span> ' + texts[idx];
      }
    }, 1200);
  }

  function stopProgressiveText() {
    if (processingTextInterval) {
      clearInterval(processingTextInterval);
      processingTextInterval = null;
    }
  }

  // ---- STATE MACHINE ----

  function transitionTo(state) {
    currentState = state;
    stabilityScore = 0;
    isProcessing = false;
    setBracketState(null);
    setDetectionText('');
    hideStabilityMeter();
    stopProgressiveText();

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

    // Show back button on states 2, 3, 4 (not on state 1)
    if (state > STATES.GARMENT_SCAN) {
      btnBack.classList.remove('hidden');
    } else {
      btnBack.classList.add('hidden');
    }

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
    stabilityScore = 0;
    updateStabilityMeter();
    showStabilityMeter();
    scanInterval = setInterval(autoScanTick, 750);
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
        stabilityScore = Math.max(0, stabilityScore - 15);
        updateStabilityMeter();
        return;
      }

      detectionIndicator.classList.remove('error');

      if (result.detected) {
        // Map confidence to stability increment
        const conf = (result.confidence || '').toLowerCase();
        let increment = 30;
        if (conf === 'high') increment = 45;
        else if (conf === 'medium') increment = 30;
        else if (conf === 'low') increment = 18;

        stabilityScore = Math.min(100, stabilityScore + increment);
        updateStabilityMeter();

        // Progressive bracket states based on stability
        if (stabilityScore >= 80) {
          setBracketState('locking');
        } else {
          setBracketState('detecting');
        }

        // Audio tick on first detection
        if (stabilityScore <= increment) {
          playDetectionTick();
        }

        // Show progress text
        const pct = Math.round(stabilityScore);
        if (pct >= 85) {
          setDetectionText('Locking on...');
        } else {
          setDetectionText('Stability: ' + pct + '%');
        }

        // Trigger capture at 100%
        if (stabilityScore >= 100) {
          setDetectionText('Capturing...');
          playCaptureSound();
          await performCapture(image);
        }
      } else {
        // Decay stability on miss
        stabilityScore = Math.max(0, stabilityScore - 25);
        updateStabilityMeter();

        if (stabilityScore > 0) {
          setBracketState('detecting');
          setDetectionText('Hold steady...');
        } else {
          setBracketState(null);
          setDetectionText('Watching...');
        }
      }
    } catch (err) {
      console.error('Auto-scan error:', err);
      setDetectionText('Network error — retrying...');
      detectionIndicator.classList.add('error');
      stabilityScore = Math.max(0, stabilityScore - 15);
      updateStabilityMeter();
    } finally {
      isProcessing = false;
    }
  }

  async function performCapture(image) {
    stopAutoScan();
    triggerFlash();
    setBracketState('captured');
    hideStabilityMeter();

    if (currentState === STATES.GARMENT_SCAN) {
      await analyzeGarment(image);
    } else if (currentState === STATES.CARE_LABEL) {
      await analyzeLabel(image);
    }
  }

  // ---- ANALYSIS FUNCTIONS ----

  async function analyzeGarment(image) {
    startProgressiveText([
      'Identifying garment...',
      'Classifying type & color...',
      'Checking for brand...',
    ]);

    try {
      const resp = await fetch('/api/analyze/garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Garment analysis failed');

      stopProgressiveText();

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
      stopProgressiveText();
      statePrompt.textContent = err.message || 'Analysis failed — retrying...';
      stabilityScore = 0;
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
    startProgressiveText([
      'Reading care symbols...',
      'Extracting fiber content...',
      'Interpreting wash instructions...',
      'Finalizing care details...',
    ]);

    try {
      const resp = await fetch('/api/analyze/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Label analysis failed');

      stopProgressiveText();

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
      stopProgressiveText();
      statePrompt.textContent = err.message || 'Label read failed — retrying...';
      stabilityScore = 0;
      startAutoScan();
    }
  }

  // ---- ORDER MANAGEMENT ----

  function addToOrder() {
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
      ${garment.brand ? `<div class="card-detail">${escapeHtml(garment.brand)}</div>` : ''}
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

  btnBack.addEventListener('click', () => {
    stopAutoScan();
    isProcessing = false;
    stopProgressiveText();
    if (currentState === STATES.DAMAGE_CAPTURE) {
      groups.garment.classList.remove('complete');
      transitionTo(STATES.GARMENT_SCAN);
    } else if (currentState === STATES.CARE_LABEL) {
      groups.damage.classList.remove('complete');
      transitionTo(STATES.DAMAGE_CAPTURE);
    } else if (currentState === STATES.COMPLETE) {
      groups.care.classList.remove('complete');
      transitionTo(STATES.CARE_LABEL);
    }
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

    cameraFeed.addEventListener('loadeddata', () => {
      transitionTo(STATES.GARMENT_SCAN);
    }, { once: true });

    if (cameraFeed.readyState >= 2) {
      transitionTo(STATES.GARMENT_SCAN);
    }
  }

  init();
})();
