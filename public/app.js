// ============================================
// GARMENT INTAKE — Application Logic
// ============================================

(function () {
  'use strict';

  // ---- CONSTANTS ----

  const GARMENT_TYPES = [
    'Shirt Laundered', 'Shirt Dry Clean', 'Dress Shirt', 'Blouse', 'Golf Shirt', 'Tee Shirt',
    'Sweater', 'Cardigan',
    'Pants', 'Trousers', 'Jeans', 'Shorts',
    'Blazer', 'Sport Coat', 'Jacket - Lightweight', 'Outer Coat - Long',
    'Suit Vest', 'Vest',
    'Dress - Everyday', 'Dress - Long', 'Skirt - Everyday',
    'Tie', 'Robe', 'Chef Jacket', 'Apron', 'Belt', 'Tablecloth', 'Socks',
  ];

  const COLORS = [
    'White', 'Black', 'Navy', 'Gray', 'Charcoal', 'Brown', 'Tan', 'Khaki', 'Beige', 'Cream',
    'Red', 'Burgundy', 'Blue', 'Light Blue', 'Royal Blue', 'Green', 'Olive', 'Forest Green',
    'Yellow', 'Gold', 'Pink', 'Purple', 'Lavender', 'Orange', 'Rust',
  ];

  // ---- STATE ----
  const STATES = {
    GARMENT_SCAN: 1,
    DAMAGE_CAPTURE: 2,
    CARE_LABEL: 3,
    COMPLETE: 4,
  };

  let currentState = STATES.GARMENT_SCAN;
  let consecutiveDetections = 0;
  let stabilityWindow = 2; // Number of consecutive 'ready' checks needed (default: 2 = 1s at 500ms interval)
  let isProcessing = false;
  let scanInterval = null;
  let processingTextInterval = null;
  let lastGarmentPhoto = null;
  let lastLabelPhoto = null;
  let orderCounter = 0;
  let existingDbGarment = null; // Garment loaded from Supabase

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
  const stabilitySelect = document.getElementById('stabilitySelect');

  // Barcode / DB refs
  const barcodeInput = document.getElementById('barcodeInput');
  const btnBarcodeLookup = document.getElementById('btnBarcodeLookup');
  const existingBanner = document.getElementById('existingBanner');
  const existingLastDate = document.getElementById('existingLastDate');
  const existingPhotos = document.getElementById('existingPhotos');
  const btnUseExisting = document.getElementById('btnUseExisting');
  const btnRescan = document.getElementById('btnRescan');

  // Orphan modal refs
  const btnFindOrphan = document.getElementById('btnFindOrphan');
  const orphanModal = document.getElementById('orphanModal');
  const btnCloseOrphan = document.getElementById('btnCloseOrphan');
  const orphanStep1 = document.getElementById('orphanStep1');
  const orphanStep2 = document.getElementById('orphanStep2');
  const orphanStep3 = document.getElementById('orphanStep3');
  const orphanStep4 = document.getElementById('orphanStep4');
  const orphanStep5 = document.getElementById('orphanStep5');
  const orphanTypeSelect = document.getElementById('orphanType');
  const orphanColorSelect = document.getElementById('orphanColor');
  const orphanDateRange = document.getElementById('orphanDateRange');
  const orphanCandidateCount = document.getElementById('orphanCandidateCount');
  const orphanVideo = document.getElementById('orphanVideo');
  const orphanCanvas = document.getElementById('orphanCanvas');
  const orphanPreview = document.getElementById('orphanPreview');
  const orphanPreviewImg = document.getElementById('orphanPreviewImg');
  const btnOrphanNext1 = document.getElementById('btnOrphanNext1');
  const btnOrphanCapture = document.getElementById('btnOrphanCapture');
  const btnOrphanRetake = document.getElementById('btnOrphanRetake');
  const btnOrphanSearch = document.getElementById('btnOrphanSearch');
  const orphanSearchText = document.getElementById('orphanSearchText');
  const orphanWarning = document.getElementById('orphanWarning');
  const orphanResults = document.getElementById('orphanResults');
  const btnOrphanRetry = document.getElementById('btnOrphanRetry');
  const orphanConfirmText = document.getElementById('orphanConfirmText');
  const orphanBarcodeText = document.getElementById('orphanBarcodeText');
  const btnOrphanDone = document.getElementById('btnOrphanDone');

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
      intakePhoto: '',
      orderNumber: 0,
      barcode: '',
      checkInDate: null,
    };
  }

  function generateBarcode() {
    const now = new Date();
    const datePart = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'BC-' + datePart + '-' + rand;
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- STABILITY METER ----

  function updateStabilityMeter() {
    const pct = stabilityWindow > 0 ? Math.min(100, (consecutiveDetections / stabilityWindow) * 100) : 0;
    stabilityFill.style.width = pct + '%';

    stabilityFill.classList.remove('low', 'medium', 'high');
    if (consecutiveDetections >= stabilityWindow) {
      stabilityFill.classList.add('high');
    } else if (consecutiveDetections > 0) {
      stabilityFill.classList.add('medium');
    } else {
      stabilityFill.classList.add('low');
    }

    if (consecutiveDetections >= stabilityWindow) {
      stabilityText.textContent = 'CAPTURING';
    } else if (consecutiveDetections > 0) {
      stabilityText.textContent = consecutiveDetections + '/' + stabilityWindow + ' STABLE';
    } else {
      stabilityText.textContent = 'SEARCHING';
    }
  }

  function showStabilityMeter() {
    stabilityMeter.classList.add('visible');
  }

  function hideStabilityMeter() {
    stabilityMeter.classList.remove('visible');
    consecutiveDetections = 0;
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
    consecutiveDetections = 0;
    isProcessing = false;
    setBracketState(null);
    setDetectionText('');
    hideStabilityMeter();
    stopProgressiveText();

    stateDots.forEach((dot) => {
      const s = parseInt(dot.dataset.state);
      dot.classList.remove('active', 'done');
      if (s < state) dot.classList.add('done');
      if (s === state) dot.classList.add('active');
    });

    damageControls.classList.add('hidden');
    completeControls.classList.add('hidden');

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
    consecutiveDetections = 0;
    updateStabilityMeter();
    showStabilityMeter();
    scanInterval = setInterval(autoScanTick, 500);
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
        consecutiveDetections = 0;
        updateStabilityMeter();
        setBracketState(null);
        return;
      }

      detectionIndicator.classList.remove('error');

      if (result.detected) {
        const prevCount = consecutiveDetections;
        consecutiveDetections++;
        updateStabilityMeter();

        // Play tick on first detection
        if (prevCount === 0) {
          playDetectionTick();
        }

        // Bracket states: yellow when detected but not yet stable, green when about to capture
        if (consecutiveDetections >= stabilityWindow) {
          setBracketState('locking');
          setDetectionText('Capturing...');
          playCaptureSound();
          await performCapture(image);
        } else {
          setBracketState('detecting');
          setDetectionText(consecutiveDetections + '/' + stabilityWindow + ' stable');
        }
      } else {
        // Any miss resets the counter
        consecutiveDetections = 0;
        updateStabilityMeter();
        setBracketState(null);
        setDetectionText('Watching...');
      }
    } catch (err) {
      console.error('Auto-scan error:', err);
      setDetectionText('Network error — retrying...');
      detectionIndicator.classList.add('error');
      consecutiveDetections = 0;
      updateStabilityMeter();
      setBracketState(null);
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
      lastGarmentPhoto = image;
      await analyzeGarment(image);
    } else if (currentState === STATES.CARE_LABEL) {
      lastLabelPhoto = image;
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
      consecutiveDetections = 0;
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
      consecutiveDetections = 0;
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

    orderCounter++;
    currentGarment.intakePhoto = lastGarmentPhoto || '';
    currentGarment.orderNumber = orderCounter;
    // Use existing barcode if loaded from DB, otherwise generate new
    currentGarment.barcode = existingDbGarment ? existingDbGarment.barcode : generateBarcode();
    currentGarment.checkInDate = new Date();

    order.push({ ...currentGarment });
    renderOrderCard(currentGarment, order.length);
    updateOrderCount();

    // Save to database in background
    saveGarmentToDatabase(currentGarment);
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
        <span class="card-number">#${garment.orderNumber} — ${escapeHtml(garment.barcode)}</span>
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

  function resetForNewGarment() {
    currentGarment = createEmptyGarment();
    lastGarmentPhoto = null;
    lastLabelPhoto = null;
    existingDbGarment = null;
    existingBanner.classList.add('hidden');
    barcodeInput.value = '';
    clearAllFields();
    resetGroups();
    transitionTo(STATES.GARMENT_SCAN);
  }

  // ---- SUPABASE / BARCODE LOOKUP ----

  async function barcodeLookup(barcode) {
    if (!barcode || barcode.trim().length === 0) return;
    barcode = barcode.trim();

    barcodeInput.disabled = true;
    btnBarcodeLookup.disabled = true;
    btnBarcodeLookup.textContent = '...';

    try {
      const resp = await fetch('/api/garment/' + encodeURIComponent(barcode));
      const data = await resp.json();

      if (data.found && data.garment) {
        displayExistingGarment(data.garment);
      } else if (data.error && data.error.includes('not configured')) {
        // Supabase not configured — silently continue with camera workflow
        console.log('Database not configured, continuing with camera flow');
      } else {
        // Not found — continue with normal workflow
        statePrompt.textContent = 'New garment — place in frame';
        existingBanner.classList.add('hidden');
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      // Network error — continue with camera workflow
    } finally {
      barcodeInput.disabled = false;
      btnBarcodeLookup.disabled = false;
      btnBarcodeLookup.textContent = 'Lookup';
    }
  }

  function displayExistingGarment(garment) {
    existingDbGarment = garment;

    // Stop auto-scan while showing existing record
    stopAutoScan();
    hideStabilityMeter();

    // Populate all fields from database record
    setFieldValue(fields.type, garment.garment_type);
    setFieldValue(fields.color, garment.color);
    setFieldValue(fields.brand, garment.brand);
    setFieldValue(fields.fiber, garment.fiber_content);
    setFieldValue(fields.dryClean, garment.care_dry_clean);
    setFieldValue(fields.washing, garment.care_washing);
    setFieldValue(fields.drying, garment.care_drying);
    setFieldValue(fields.ironing, garment.care_ironing);
    setFieldValue(fields.bleaching, garment.care_bleaching);

    // Show last checked in date
    if (garment.last_checked_in) {
      const date = new Date(garment.last_checked_in);
      existingLastDate.textContent = 'Last checked in: ' + date.toLocaleDateString();
    } else {
      existingLastDate.textContent = '';
    }

    // Show photo thumbnails
    existingPhotos.innerHTML = '';
    if (garment.photo_front_url) {
      const img = document.createElement('img');
      img.src = garment.photo_front_url;
      img.alt = 'Front photo';
      existingPhotos.appendChild(img);
    }
    if (garment.photo_label_url) {
      const img = document.createElement('img');
      img.src = garment.photo_label_url;
      img.alt = 'Label photo';
      existingPhotos.appendChild(img);
    }

    // Show the banner
    existingBanner.classList.remove('hidden');
    statePrompt.textContent = 'Returning garment found in database';
    setBracketState('captured');
    setDetectionText('');

    // Update barcode input to show the matched barcode
    barcodeInput.value = garment.barcode;
  }

  function useExistingGarment() {
    if (!existingDbGarment) return;

    // Mark all groups as complete
    markGroupComplete('garment');
    markGroupComplete('damage');
    markGroupComplete('care');

    // Transition directly to COMPLETE state
    existingBanner.classList.add('hidden');
    transitionTo(STATES.COMPLETE);
  }

  function rescanGarment() {
    existingDbGarment = null;
    existingBanner.classList.add('hidden');
    clearAllFields();
    resetGroups();
    transitionTo(STATES.GARMENT_SCAN);
  }

  async function saveGarmentToDatabase(garment) {
    try {
      const payload = {
        barcode: garment.barcode,
        garmentType: garment.garmentType,
        color: garment.color,
        brand: garment.brand,
        fiberContent: garment.fiberContent,
        careDryClean: garment.dryClean,
        careWashing: garment.washing,
        careDrying: garment.drying,
        careIroning: garment.ironing,
        careBleaching: garment.bleaching,
        damageNotes: garment.damages.length > 0
          ? garment.damages.map(function(d) { return d.severity + ' ' + d.type + (d.location ? ' at ' + d.location : ''); }).join('; ')
          : null,
        photos: {},
      };

      // Attach photos if available
      if (lastGarmentPhoto) {
        payload.photos.front = lastGarmentPhoto;
      }
      if (lastLabelPhoto) {
        payload.photos.label = lastLabelPhoto;
      }

      const resp = await fetch('/api/garment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await resp.json();

      if (resp.ok && result.success) {
        console.log('Garment saved to database:', garment.barcode);
        showSaveStatus('saved', 'Saved to database');
      } else {
        console.error('Save failed:', result.error);
        showSaveStatus('save-error', result.error || 'Save failed');
      }
    } catch (err) {
      console.error('Database save error:', err);
      showSaveStatus('save-error', 'Could not reach database');
    }
  }

  function showSaveStatus(type, message) {
    // Find the last order card and append status
    const cards = orderList.querySelectorAll('.order-card');
    if (cards.length === 0) return;
    const lastCard = cards[cards.length - 1];

    // Remove any existing status
    const existing = lastCard.querySelector('.save-status');
    if (existing) existing.remove();

    const status = document.createElement('div');
    status.className = 'save-status ' + type;
    status.textContent = message;
    lastCard.appendChild(status);

    // Auto-hide success after 3 seconds
    if (type === 'saved') {
      setTimeout(function() { status.remove(); }, 3000);
    }
  }

  // ---- ORPHAN RECOVERY ----

  let orphanPhoto = null;
  let orphanCandidates = [];

  function populateOrphanDropdowns() {
    GARMENT_TYPES.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      orphanTypeSelect.appendChild(opt);
    });

    COLORS.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      orphanColorSelect.appendChild(opt);
    });
  }

  function filterCandidates() {
    const typeFilter = orphanTypeSelect.value;
    const colorFilter = orphanColorSelect.value;
    const days = parseInt(orphanDateRange.value);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return order.filter((g) => {
      if (!g.intakePhoto) return false;
      if (typeFilter && g.garmentType !== typeFilter) return false;
      if (colorFilter && g.color !== colorFilter) return false;
      if (g.checkInDate && g.checkInDate < cutoff) return false;
      return true;
    }).slice(0, 10);
  }

  function updateCandidateCount() {
    const candidates = filterCandidates();
    if (candidates.length === 0) {
      orphanCandidateCount.textContent = 'No garments match these filters. Try widening your search.';
      btnOrphanNext1.disabled = true;
    } else {
      orphanCandidateCount.textContent = candidates.length + ' candidate garment' + (candidates.length !== 1 ? 's' : '') + ' found.';
      btnOrphanNext1.disabled = false;
    }
  }

  function showOrphanStep(step) {
    [orphanStep1, orphanStep2, orphanStep3, orphanStep4, orphanStep5].forEach((s) => {
      s.classList.add('hidden');
    });
    step.classList.remove('hidden');

    if (step === orphanStep2) {
      // Share camera stream with orphan video
      if (cameraFeed.srcObject) {
        orphanVideo.srcObject = cameraFeed.srcObject;
        orphanVideo.play().catch(() => {});
      }
      // Reset capture state
      orphanPreview.classList.add('hidden');
      btnOrphanCapture.classList.remove('hidden');
      btnOrphanRetake.classList.add('hidden');
      btnOrphanSearch.classList.add('hidden');
      orphanPhoto = null;
    }
  }

  function openOrphanModal() {
    stopAutoScan();
    orphanModal.classList.remove('hidden');
    showOrphanStep(orphanStep1);
    updateCandidateCount();
  }

  function closeOrphanModal() {
    orphanModal.classList.add('hidden');
    orphanVideo.srcObject = null;
    orphanPhoto = null;
    orphanCandidates = [];
    // Resume auto-scan if in a scan state
    if (currentState === STATES.GARMENT_SCAN || currentState === STATES.CARE_LABEL) {
      startAutoScan();
    }
  }

  function captureOrphanFrame() {
    const ctx = orphanCanvas.getContext('2d');
    orphanCanvas.width = orphanVideo.videoWidth;
    orphanCanvas.height = orphanVideo.videoHeight;
    ctx.drawImage(orphanVideo, 0, 0);
    return orphanCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  function orphanDoCapture() {
    orphanPhoto = captureOrphanFrame();
    orphanPreviewImg.src = 'data:image/jpeg;base64,' + orphanPhoto;
    orphanPreview.classList.remove('hidden');
    btnOrphanCapture.classList.add('hidden');
    btnOrphanRetake.classList.remove('hidden');
    btnOrphanSearch.classList.remove('hidden');
  }

  function orphanRetake() {
    orphanPhoto = null;
    orphanPreview.classList.add('hidden');
    btnOrphanCapture.classList.remove('hidden');
    btnOrphanRetake.classList.add('hidden');
    btnOrphanSearch.classList.add('hidden');
  }

  async function orphanSearch() {
    orphanCandidates = filterCandidates();
    if (!orphanPhoto || orphanCandidates.length === 0) return;

    showOrphanStep(orphanStep3);
    orphanSearchText.textContent = 'Analyzing and comparing to ' + orphanCandidates.length + ' recent garment' + (orphanCandidates.length !== 1 ? 's' : '') + '...';

    try {
      const candidateData = orphanCandidates.map((g) => ({
        barcode: g.barcode,
        orderNumber: g.orderNumber,
        photo: g.intakePhoto,
      }));

      const resp = await fetch('/api/orphan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orphanPhoto, candidates: candidateData }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Matching failed');

      displayOrphanResults(data);
    } catch (err) {
      console.error('Orphan matching error:', err);
      showOrphanStep(orphanStep4);
      orphanWarning.classList.remove('hidden');
      orphanWarning.textContent = 'Error: ' + (err.message || 'Matching failed. Try again.');
      orphanResults.innerHTML = '';
    }
  }

  function displayOrphanResults(data) {
    showOrphanStep(orphanStep4);
    orphanResults.innerHTML = '';
    orphanWarning.classList.add('hidden');

    const matches = (data.matches || []).sort((a, b) => b.confidence - a.confidence).slice(0, 3);

    if (matches.length === 0) {
      orphanWarning.classList.remove('hidden');
      orphanWarning.textContent = 'No matches found. Try widening the date range or changing filters.';
      return;
    }

    const topConfidence = matches[0].confidence;
    const highMatches = matches.filter((m) => m.confidence >= 0.85);

    if (topConfidence < 0.6) {
      orphanWarning.classList.remove('hidden');
      orphanWarning.textContent = 'Low confidence — No strong matches found. Verify carefully or try different filters.';
    } else if (highMatches.length >= 2) {
      orphanWarning.classList.remove('hidden');
      orphanWarning.textContent = 'Multiple possible matches found — verify carefully before selecting.';
    }

    matches.forEach((match) => {
      const candidate = orphanCandidates.find((g) => g.barcode === match.candidateId);
      if (!candidate) return;

      const confPct = Math.round(match.confidence * 100);
      const confClass = confPct >= 80 ? 'high' : confPct >= 60 ? 'medium' : 'low';
      const dateStr = candidate.checkInDate ? candidate.checkInDate.toLocaleDateString() : 'N/A';

      const featuresHtml = (match.matchingFeatures || [])
        .map((f) => '<span>' + escapeHtml(f) + '</span>')
        .join('');

      const card = document.createElement('div');
      card.className = 'match-card';
      card.innerHTML = `
        <div class="match-card-header">
          <div class="match-confidence ${confClass}">${confPct}% MATCH</div>
          <div class="match-meta">
            Order #${candidate.orderNumber}<br>
            ${escapeHtml(candidate.color)} ${escapeHtml(candidate.garmentType)}<br>
            Checked in: ${dateStr}
          </div>
        </div>
        <div class="match-photos">
          <div>
            <div class="match-photo-label">Orphan</div>
            <img src="data:image/jpeg;base64,${orphanPhoto}" alt="Orphan garment">
          </div>
          <div>
            <div class="match-photo-label">Intake Photo</div>
            <img src="data:image/jpeg;base64,${candidate.intakePhoto}" alt="Candidate intake">
          </div>
        </div>
        ${featuresHtml ? '<div class="match-features">' + featuresHtml + '</div>' : ''}
        <button class="btn-select-match" data-barcode="${escapeHtml(candidate.barcode)}">SELECT THIS MATCH</button>
      `;
      orphanResults.appendChild(card);
    });

    // Wire up select buttons
    orphanResults.querySelectorAll('.btn-select-match').forEach((btn) => {
      btn.addEventListener('click', () => {
        confirmOrphanMatch(btn.dataset.barcode);
      });
    });
  }

  function confirmOrphanMatch(barcode) {
    const candidate = order.find((g) => g.barcode === barcode);
    if (!candidate) return;

    const newBarcode = generateBarcode();
    const now = new Date().toLocaleDateString();

    // Update the order record
    candidate.barcode = newBarcode;
    candidate.orphanRecovery = 'Barcode replaced during orphan recovery on ' + now;

    showOrphanStep(orphanStep5);
    orphanConfirmText.textContent = 'Orphan matched to Order #' + candidate.orderNumber + ' — ' + candidate.color + ' ' + candidate.garmentType;
    orphanBarcodeText.textContent = newBarcode;
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

  stabilitySelect.addEventListener('change', () => {
    stabilityWindow = parseInt(stabilitySelect.value);
    consecutiveDetections = 0;
    updateStabilityMeter();
  });

  // Barcode input — Enter key triggers lookup
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      barcodeLookup(barcodeInput.value);
    }
  });

  btnBarcodeLookup.addEventListener('click', () => {
    barcodeLookup(barcodeInput.value);
  });

  btnUseExisting.addEventListener('click', useExistingGarment);
  btnRescan.addEventListener('click', rescanGarment);

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

  // Orphan event listeners
  btnFindOrphan.addEventListener('click', openOrphanModal);
  btnCloseOrphan.addEventListener('click', closeOrphanModal);

  orphanTypeSelect.addEventListener('change', updateCandidateCount);
  orphanColorSelect.addEventListener('change', updateCandidateCount);
  orphanDateRange.addEventListener('change', updateCandidateCount);

  btnOrphanNext1.addEventListener('click', () => {
    const candidates = filterCandidates();
    if (candidates.length === 0) return;
    showOrphanStep(orphanStep2);
  });

  btnOrphanCapture.addEventListener('click', orphanDoCapture);
  btnOrphanRetake.addEventListener('click', orphanRetake);
  btnOrphanSearch.addEventListener('click', orphanSearch);

  btnOrphanRetry.addEventListener('click', () => {
    showOrphanStep(orphanStep1);
    updateCandidateCount();
  });

  btnOrphanDone.addEventListener('click', closeOrphanModal);

  // ---- INIT ----

  async function init() {
    statePrompt.textContent = 'Initializing camera...';
    populateOrphanDropdowns();

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
