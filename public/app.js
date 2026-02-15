// ============================================
// DRY CLEANING INTAKE — Screen-Based Workflow
// ============================================

(function () {
  'use strict';

  // ---- WORKFLOW STATE ----
  let currentOrder = null;   // { id, orderNumber, customerBarcode, customerName, items: [] }
  let currentGarmentBarcode = null;
  let isRescan = false;      // true when re-scanning an existing garment
  let cameraInitialized = false;

  // ---- CAMERA CAPTURE STATE ----
  const CAPTURE_STATES = {
    GARMENT_SCAN: 1,
    GARMENT_REVIEW: 2,
    DAMAGE_CAPTURE: 3,
    CARE_LABEL: 4,
    CAPTURE_COMPLETE: 5,
  };
  let captureState = CAPTURE_STATES.GARMENT_SCAN;
  let consecutiveDetections = 0;
  let stabilityWindow = 2;
  let isProcessing = false;
  let scanInterval = null;
  let processingTextInterval = null;
  let lastGarmentPhoto = null;
  let lastLabelPhoto = null;
  let currentGarment = createEmptyGarment();

  // ---- SCREENS ----
  const screens = {
    start: document.getElementById('screenStart'),
    customer: document.getElementById('screenCustomer'),
    newCustomer: document.getElementById('screenNewCustomer'),
    garmentEntry: document.getElementById('screenGarmentEntry'),
    existingGarment: document.getElementById('screenExistingGarment'),
    camera: document.getElementById('screenCamera'),
    review: document.getElementById('screenReview'),
    orphan: document.getElementById('screenOrphan'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(function (s) { s.classList.remove('active'); });
    screens[name].classList.add('active');
    if (name === 'customer') {
      setTimeout(function () { custBarcodeInput.focus(); }, 100);
    } else if (name === 'garmentEntry') {
      setTimeout(function () { garmentBarcodeInput.focus(); }, 100);
    } else if (name === 'newCustomer') {
      setTimeout(function () { custNameInput.focus(); }, 100);
    } else if (name === 'orphan') {
      setTimeout(function () { orphanBarcodeInput.focus(); }, 100);
    }
  }

  // ---- DOM REFS ----
  // Screen 1
  var btnStartOrder = document.getElementById('btnStartOrder');
  var btnOrphan = document.getElementById('btnOrphan');

  // Screen 2
  var custBarcodeInput = document.getElementById('custBarcodeInput');
  var btnCustLookup = document.getElementById('btnCustLookup');
  var btnNewCustomer = document.getElementById('btnNewCustomer');
  var custError = document.getElementById('custError');
  var btnCustBack = document.getElementById('btnCustBack');

  // Screen 2b
  var newCustBarcode = document.getElementById('newCustBarcode');
  var custNameInput = document.getElementById('custName');
  var custPhoneInput = document.getElementById('custPhone');
  var custEmailInput = document.getElementById('custEmail');
  var btnCreateCustomer = document.getElementById('btnCreateCustomer');
  var newCustError = document.getElementById('newCustError');
  var btnNewCustBack = document.getElementById('btnNewCustBack');

  // Screen 3
  var orderNumberEl = document.getElementById('orderNumber');
  var orderCustomerEl = document.getElementById('orderCustomer');
  var orderItemCountEl = document.getElementById('orderItemCount');
  var garmentBarcodeInput = document.getElementById('garmentBarcodeInput');
  var btnScanGarment = document.getElementById('btnScanGarment');
  var btnNewGarment = document.getElementById('btnNewGarment');
  var garmentError = document.getElementById('garmentError');
  var orderItemsList = document.getElementById('orderItemsList');
  var btnFinishOrder = document.getElementById('btnFinishOrder');
  var btnGarmentBack = document.getElementById('btnGarmentBack');

  // Screen 3b
  var existBarcode = document.getElementById('existBarcode');
  var existDetails = document.getElementById('existDetails');
  var existPhotos = document.getElementById('existPhotos');
  var btnAddExisting = document.getElementById('btnAddExisting');
  var btnRescanExisting = document.getElementById('btnRescanExisting');
  var btnExistBack = document.getElementById('btnExistBack');

  // Screen 4 (camera) — core elements
  var cameraFeed = document.getElementById('cameraFeed');
  var captureCanvas = document.getElementById('captureCanvas');
  var cameraSelect = document.getElementById('cameraSelect');
  var stabilitySelect = document.getElementById('stabilitySelect');
  var statePrompt = document.getElementById('statePrompt');
  var detectionIndicator = document.getElementById('detectionIndicator');
  var flashOverlay = document.getElementById('flashOverlay');
  var damageControls = document.getElementById('damageControls');
  var btnCaptureDamage = document.getElementById('btnCaptureDamage');
  var btnSkipDamage = document.getElementById('btnSkipDamage');
  var btnCameraBack = document.getElementById('btnCameraBack');
  var brackets = document.querySelectorAll('.bracket');
  var stabilityMeter = document.getElementById('stabilityMeter');
  var stabilityFill = document.getElementById('stabilityFill');
  var stabilityText = document.getElementById('stabilityText');
  var cameraOrderNum = document.getElementById('cameraOrderNum');
  var cameraGarmentBarcode = document.getElementById('cameraGarmentBarcode');

  // Screen 4 — progressive sections
  var secScan = document.getElementById('secScan');
  var secGarment = document.getElementById('secGarment');
  var secDamage = document.getElementById('secDamage');
  var secCare = document.getElementById('secCare');
  var secConfirm = document.getElementById('secConfirm');
  var scanStatusText = document.getElementById('scanStatusText');
  var careStatusText = document.getElementById('careStatusText');
  var garmentSummaryText = document.getElementById('garmentSummaryText');
  var damageSummaryText = document.getElementById('damageSummaryText');
  var careSummaryText = document.getElementById('careSummaryText');
  var confirmSummary = document.getElementById('confirmSummary');
  var damageList = document.getElementById('damageList');
  var garmentActions = document.getElementById('garmentActions');
  var btnGarmentOk = document.getElementById('btnGarmentOk');
  var btnGarmentRescan = document.getElementById('btnGarmentRescan');
  var btnDamageDone = document.getElementById('btnDamageDone');
  var btnConfirmAdd = document.getElementById('btnConfirmAdd');
  var progDots = document.querySelectorAll('.prog-dot');

  // Fields
  var fields = {
    type: document.getElementById('fieldType'),
    color: document.getElementById('fieldColor'),
    brand: document.getElementById('fieldBrand'),
    fiber: document.getElementById('fieldFiber'),
    dryClean: document.getElementById('fieldDryClean'),
    washing: document.getElementById('fieldWashing'),
    drying: document.getElementById('fieldDrying'),
    ironing: document.getElementById('fieldIroning'),
    bleaching: document.getElementById('fieldBleaching'),
  };

  // Screen 5
  var reviewOrderInfo = document.getElementById('reviewOrderInfo');
  var reviewItemsList = document.getElementById('reviewItemsList');
  var btnCompleteOrder = document.getElementById('btnCompleteOrder');
  var btnSendSmrt = document.getElementById('btnSendSmrt');
  var btnReviewBack = document.getElementById('btnReviewBack');
  var orderCompleteToast = document.getElementById('orderCompleteToast');

  // ---- HELPERS ----
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function hideError(el) {
    el.classList.add('hidden');
  }

  function createEmptyGarment() {
    return { garmentType: '', color: '', brand: '', fiberContent: '', dryClean: '', washing: '', drying: '', ironing: '', bleaching: '', damages: [] };
  }

  function setFieldValue(field, value) {
    if (value && value !== 'Not visible' && value !== 'Not specified') {
      field.value = value;
      field.classList.add('populated');
    }
  }

  function clearAllFields() {
    Object.values(fields).forEach(function (f) { f.value = ''; f.classList.remove('populated'); });
    damageList.innerHTML = '<p class="placeholder-text">No damage recorded</p>';
  }

  // ---- PROGRESSIVE SECTION MANAGEMENT ----
  function setSectionState(section, state) {
    section.classList.remove('sec-active', 'sec-collapsed', 'sec-review');
    if (state === 'active') section.classList.add('sec-active');
    else if (state === 'collapsed') section.classList.add('sec-collapsed');
    else if (state === 'review') section.classList.add('sec-review');
    // 'hidden' = no class added → display: none via CSS
  }

  function resetAllSections() {
    [secScan, secGarment, secDamage, secCare, secConfirm].forEach(function (s) {
      setSectionState(s, 'hidden');
    });
  }

  function buildGarmentSummary() {
    var parts = [];
    if (fields.color.value) parts.push(fields.color.value);
    if (fields.type.value) parts.push(fields.type.value);
    if (fields.brand.value) parts.push('\u2014 ' + fields.brand.value);
    return parts.join(' ') || 'Garment scanned';
  }

  function buildDamageSummary() {
    var count = currentGarment.damages.length;
    if (count === 0) return 'No damage';
    return count + ' issue' + (count > 1 ? 's' : '') + ' found';
  }

  function buildCareSummary() {
    var parts = [];
    if (fields.dryClean.value && fields.dryClean.value !== 'Not specified') parts.push(fields.dryClean.value);
    if (fields.fiber.value && fields.fiber.value !== 'Not specified') parts.push(fields.fiber.value);
    return parts.join(' \u2014 ') || 'Care info captured';
  }

  function buildConfirmSummaryHtml() {
    var html = '';

    // Garment info
    html += '<div class="confirm-group">';
    html += '<div class="confirm-group-title">Garment</div>';
    if (fields.type.value) html += '<div class="confirm-row"><span class="confirm-label">Type</span><span class="confirm-value">' + escapeHtml(fields.type.value) + '</span></div>';
    if (fields.color.value) html += '<div class="confirm-row"><span class="confirm-label">Color</span><span class="confirm-value">' + escapeHtml(fields.color.value) + '</span></div>';
    if (fields.brand.value) html += '<div class="confirm-row"><span class="confirm-label">Brand</span><span class="confirm-value">' + escapeHtml(fields.brand.value) + '</span></div>';
    html += '</div>';

    // Damage
    html += '<div class="confirm-group">';
    html += '<div class="confirm-group-title">Damage</div>';
    if (currentGarment.damages.length === 0) {
      html += '<div class="confirm-row"><span class="confirm-value" style="color:var(--success)">No damage recorded</span></div>';
    } else {
      currentGarment.damages.forEach(function (d) {
        html += '<div class="confirm-row"><span class="confirm-value">' + escapeHtml((d.severity || '') + ' ' + (d.type || '') + (d.location ? ' at ' + d.location : '')) + '</span></div>';
      });
    }
    html += '</div>';

    // Care
    html += '<div class="confirm-group">';
    html += '<div class="confirm-group-title">Care Instructions</div>';
    if (fields.fiber.value) html += '<div class="confirm-row"><span class="confirm-label">Fiber</span><span class="confirm-value">' + escapeHtml(fields.fiber.value) + '</span></div>';
    if (fields.dryClean.value) html += '<div class="confirm-row"><span class="confirm-label">Dry Clean</span><span class="confirm-value">' + escapeHtml(fields.dryClean.value) + '</span></div>';
    if (fields.washing.value) html += '<div class="confirm-row"><span class="confirm-label">Washing</span><span class="confirm-value">' + escapeHtml(fields.washing.value) + '</span></div>';
    if (fields.drying.value) html += '<div class="confirm-row"><span class="confirm-label">Drying</span><span class="confirm-value">' + escapeHtml(fields.drying.value) + '</span></div>';
    if (fields.ironing.value) html += '<div class="confirm-row"><span class="confirm-label">Ironing</span><span class="confirm-value">' + escapeHtml(fields.ironing.value) + '</span></div>';
    if (fields.bleaching.value) html += '<div class="confirm-row"><span class="confirm-label">Bleaching</span><span class="confirm-value">' + escapeHtml(fields.bleaching.value) + '</span></div>';
    html += '</div>';

    return html;
  }

  // ---- AUDIO ----
  var audioCtx = null;
  function getAudioContext() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
  function playTone(freq, dur, vol, delay) {
    try { var ctx = getAudioContext(); var o = ctx.createOscillator(); var g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = freq; o.type = 'sine'; var s = ctx.currentTime + (delay || 0); g.gain.setValueAtTime(vol, s); g.gain.exponentialRampToValueAtTime(0.001, s + dur); o.start(s); o.stop(s + dur); } catch (e) {}
  }
  function playDetectionTick() { playTone(600, 0.06, 0.06, 0); }
  function playCaptureSound() { playTone(880, 0.12, 0.1, 0); playTone(1100, 0.15, 0.12, 0.1); }

  // ========================================
  // SCREEN 1: START
  // ========================================

  btnStartOrder.addEventListener('click', function () {
    showScreen('customer');
    custBarcodeInput.value = '';
    hideError(custError);
  });

  // ---- Orphan DOM refs ----
  var orphanBarcodeInput = document.getElementById('orphanBarcodeInput');
  var btnOrphanLookup = document.getElementById('btnOrphanLookup');
  var orphanError = document.getElementById('orphanError');
  var orphanResults = document.getElementById('orphanResults');
  var orphanBarcode = document.getElementById('orphanBarcode');
  var orphanPhotos = document.getElementById('orphanPhotos');
  var orphanDetails = document.getElementById('orphanDetails');
  var orphanOrderInfo = document.getElementById('orphanOrderInfo');
  var btnOrphanBack = document.getElementById('btnOrphanBack');

  btnOrphan.addEventListener('click', function () {
    orphanBarcodeInput.value = '';
    hideError(orphanError);
    orphanResults.classList.add('hidden');
    showScreen('orphan');
  });

  function doOrphanLookup() {
    var barcode = orphanBarcodeInput.value.trim();
    if (!barcode) return;
    hideError(orphanError);
    orphanResults.classList.add('hidden');
    btnOrphanLookup.disabled = true;
    btnOrphanLookup.textContent = 'LOOKING UP...';

    fetch('/api/orphan/lookup/' + encodeURIComponent(barcode))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error && data.error.includes('not configured')) {
          showError(orphanError, 'Database not configured.');
          return;
        }
        if (!data.found) {
          showError(orphanError, 'No garment found with barcode "' + escapeHtml(barcode) + '".');
          return;
        }
        showOrphanResults(data.garment, data.orders || []);
      })
      .catch(function (err) {
        showError(orphanError, 'Lookup failed: ' + err.message);
      })
      .finally(function () {
        btnOrphanLookup.disabled = false;
        btnOrphanLookup.textContent = 'LOOK UP GARMENT';
      });
  }

  function showOrphanResults(garment, orders) {
    orphanResults.classList.remove('hidden');

    orphanBarcode.textContent = 'Barcode: ' + garment.barcode;

    // Photos
    orphanPhotos.innerHTML = '';
    if (garment.photo_front_url) {
      var img = document.createElement('img');
      img.src = garment.photo_front_url;
      img.alt = 'Front photo';
      orphanPhotos.appendChild(img);
    }
    if (garment.photo_label_url) {
      var img2 = document.createElement('img');
      img2.src = garment.photo_label_url;
      img2.alt = 'Label photo';
      orphanPhotos.appendChild(img2);
    }

    // Garment details
    var rows = [];
    if (garment.garment_type) rows.push({ label: 'Type', value: garment.garment_type });
    if (garment.color) rows.push({ label: 'Color', value: garment.color });
    if (garment.brand) rows.push({ label: 'Brand', value: garment.brand });
    if (garment.fiber_content) rows.push({ label: 'Fiber', value: garment.fiber_content });
    if (garment.care_dry_clean) rows.push({ label: 'Dry Clean', value: garment.care_dry_clean });
    if (garment.care_washing) rows.push({ label: 'Washing', value: garment.care_washing });
    if (garment.care_drying) rows.push({ label: 'Drying', value: garment.care_drying });
    if (garment.care_ironing) rows.push({ label: 'Ironing', value: garment.care_ironing });
    if (garment.care_bleaching) rows.push({ label: 'Bleaching', value: garment.care_bleaching });
    if (garment.last_checked_in) {
      rows.push({ label: 'Last checked in', value: new Date(garment.last_checked_in).toLocaleDateString() });
    }
    orphanDetails.innerHTML = rows.map(function (r) {
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(r.label) + '</span><span class="detail-value">' + escapeHtml(r.value) + '</span></div>';
    }).join('');

    // Order / customer info
    if (orders.length === 0) {
      orphanOrderInfo.innerHTML = '<div class="orphan-no-orders">This garment is not associated with any order.</div>';
    } else {
      orphanOrderInfo.innerHTML = orders.map(function (entry) {
        var o = entry.order;
        var c = entry.customer;
        var html = '<div class="orphan-order-card">';
        html += '<div class="order-card-title">Order: ' + escapeHtml(o.order_number || '#' + o.id) + '</div>';
        if (c && c.name) {
          html += '<div class="order-card-row"><span class="order-card-label">Customer</span><span class="order-card-value">' + escapeHtml(c.name) + '</span></div>';
        }
        if (c && c.phone) {
          html += '<div class="order-card-row"><span class="order-card-label">Phone</span><span class="order-card-value">' + escapeHtml(c.phone) + '</span></div>';
        }
        if (c && c.email) {
          html += '<div class="order-card-row"><span class="order-card-label">Email</span><span class="order-card-value">' + escapeHtml(c.email) + '</span></div>';
        }
        if (c && c.customer_barcode) {
          html += '<div class="order-card-row"><span class="order-card-label">Customer ID</span><span class="order-card-value">' + escapeHtml(c.customer_barcode) + '</span></div>';
        }
        html += '<div class="order-card-row"><span class="order-card-label">Status</span><span class="order-card-value">' + escapeHtml(o.status || 'unknown') + '</span></div>';
        if (o.created_at) {
          html += '<div class="order-card-row"><span class="order-card-label">Created</span><span class="order-card-value">' + new Date(o.created_at).toLocaleDateString() + '</span></div>';
        }
        html += '</div>';
        return html;
      }).join('');
    }
  }

  orphanBarcodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doOrphanLookup(); }
  });
  btnOrphanLookup.addEventListener('click', doOrphanLookup);

  btnOrphanBack.addEventListener('click', function () {
    showScreen('start');
  });

  // ========================================
  // SCREEN 2: CUSTOMER LOOKUP
  // ========================================

  function doCustomerLookup() {
    var barcode = custBarcodeInput.value.trim();
    if (!barcode) return;
    hideError(custError);
    btnCustLookup.disabled = true;
    btnCustLookup.textContent = 'LOOKING UP...';

    fetch('/api/customer/' + encodeURIComponent(barcode))
      .then(function (r) {
        if (!r.ok && r.status !== 200) {
          return r.json().then(function (d) { throw new Error(d.error || 'Server error ' + r.status); });
        }
        return r.json();
      })
      .then(function (data) {
        if (data.found && data.customer) {
          btnCustLookup.textContent = 'CREATING ORDER...';
          return createOrderForCustomer(data.customer.customer_barcode, data.customer.name, custError);
        } else if (data.error && data.error.includes('not configured')) {
          showError(custError, 'Database not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env');
        } else {
          showError(custError, 'Customer barcode not found. Click "New Customer" to register.');
        }
      })
      .catch(function (err) {
        showError(custError, 'Lookup failed: ' + err.message);
      })
      .finally(function () {
        btnCustLookup.disabled = false;
        btnCustLookup.textContent = 'SCAN CUSTOMER BAG';
      });
  }

  custBarcodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCustomerLookup(); }
  });
  btnCustLookup.addEventListener('click', doCustomerLookup);

  btnNewCustomer.addEventListener('click', function () {
    showScreen('newCustomer');
    hideError(newCustError);
    custNameInput.value = '';
    custPhoneInput.value = '';
    custEmailInput.value = '';
    newCustBarcode.textContent = 'Generating...';
    fetch('/api/customer/next-barcode')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        newCustBarcode.textContent = data.barcode || 'CUST-00001';
      })
      .catch(function () {
        newCustBarcode.textContent = 'CUST-00001';
      });
  });

  btnCustBack.addEventListener('click', function () { showScreen('start'); });

  // ========================================
  // SCREEN 2b: NEW CUSTOMER
  // ========================================

  btnCreateCustomer.addEventListener('click', function () {
    var name = custNameInput.value.trim();
    if (!name) { showError(newCustError, 'Customer name is required.'); return; }
    hideError(newCustError);
    var barcode = newCustBarcode.textContent;
    btnCreateCustomer.disabled = true;
    btnCreateCustomer.textContent = 'CREATING...';

    fetch('/api/customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_barcode: barcode,
        name: name,
        phone: custPhoneInput.value.trim() || null,
        email: custEmailInput.value.trim() || null,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          btnCreateCustomer.textContent = 'CREATING ORDER...';
          return createOrderForCustomer(barcode, name, newCustError);
        } else {
          showError(newCustError, data.error || 'Failed to create customer');
        }
      })
      .catch(function (err) {
        showError(newCustError, 'Error: ' + err.message);
      })
      .finally(function () {
        btnCreateCustomer.disabled = false;
        btnCreateCustomer.textContent = 'CREATE CUSTOMER';
      });
  });

  btnNewCustBack.addEventListener('click', function () { showScreen('customer'); });

  // ========================================
  // CREATE ORDER & GO TO GARMENT ENTRY
  // ========================================

  function createOrderForCustomer(customerBarcode, customerName, errorEl) {
    return fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_barcode: customerBarcode }),
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return { error: 'Server error ' + r.status }; }).then(function (d) {
            throw new Error(d.error || 'Failed to create order');
          });
        }
        return r.json();
      })
      .then(function (data) {
        if (data.success && data.order) {
          currentOrder = {
            id: data.order.id,
            orderNumber: data.order.order_number || 'ORD-' + Date.now(),
            customerBarcode: customerBarcode,
            customerName: customerName,
            items: [],
          };
          enterGarmentScreen();
        } else {
          throw new Error(data.error || 'Failed to create order');
        }
      })
      .catch(function (err) {
        showError(errorEl || custError, 'Order creation failed: ' + err.message);
      });
  }

  function enterGarmentScreen() {
    showScreen('garmentEntry');
    garmentBarcodeInput.value = '';
    hideError(garmentError);
    orderNumberEl.textContent = currentOrder.orderNumber;
    orderCustomerEl.textContent = 'Customer: ' + currentOrder.customerName;
    updateItemDisplay();
  }

  function updateItemDisplay() {
    var count = currentOrder.items.length;
    orderItemCountEl.textContent = 'Items: ' + count;

    if (count === 0) {
      orderItemsList.innerHTML = '<p class="items-placeholder">No garments added yet</p>';
      btnFinishOrder.classList.add('hidden');
    } else {
      orderItemsList.innerHTML = '';
      currentOrder.items.forEach(function (item, idx) {
        var row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML =
          '<div class="item-info">' + (idx + 1) + '. ' + escapeHtml(item.color || '') + ' ' + escapeHtml(item.garmentType || 'Garment') +
          '<div class="item-sub">' + escapeHtml(item.barcode) + (item.brand ? ' \u2014 ' + escapeHtml(item.brand) : '') +
          (item.dryClean && item.dryClean !== 'Not specified' ? ' \u2014 ' + escapeHtml(item.dryClean) : '') +
          '</div></div>';
        orderItemsList.appendChild(row);
      });
      btnFinishOrder.classList.remove('hidden');
    }
  }

  // ========================================
  // SCREEN 3: GARMENT ENTRY
  // ========================================

  function doGarmentLookup() {
    var barcode = garmentBarcodeInput.value.trim();
    if (!barcode) return;
    hideError(garmentError);
    btnScanGarment.disabled = true;
    btnScanGarment.textContent = 'LOOKING UP...';

    fetch('/api/garment/' + encodeURIComponent(barcode))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.found && data.garment) {
          showExistingGarment(data.garment);
        } else if (data.error && data.error.includes('not configured')) {
          showError(garmentError, 'Database not configured.');
        } else {
          currentGarmentBarcode = barcode;
          isRescan = false;
          goToCameraCapture();
        }
      })
      .catch(function (err) {
        showError(garmentError, 'Lookup failed: ' + err.message);
      })
      .finally(function () {
        btnScanGarment.disabled = false;
        btnScanGarment.textContent = 'SCAN GARMENT';
      });
  }

  garmentBarcodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doGarmentLookup(); }
  });
  btnScanGarment.addEventListener('click', doGarmentLookup);

  btnNewGarment.addEventListener('click', function () {
    hideError(garmentError);
    btnNewGarment.disabled = true;
    btnNewGarment.textContent = 'GENERATING...';

    fetch('/api/garment/next-barcode')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        currentGarmentBarcode = data.barcode || ('GARM-' + String(Date.now()).slice(-5));
        isRescan = false;
        goToCameraCapture();
      })
      .catch(function () {
        currentGarmentBarcode = 'GARM-' + String(Date.now()).slice(-5);
        isRescan = false;
        goToCameraCapture();
      })
      .finally(function () {
        btnNewGarment.disabled = false;
        btnNewGarment.textContent = 'NEW GARMENT';
      });
  });

  btnFinishOrder.addEventListener('click', function () {
    showReviewScreen();
  });

  btnGarmentBack.addEventListener('click', function () {
    showScreen('customer');
  });

  // ========================================
  // SCREEN 3b: EXISTING GARMENT FOUND
  // ========================================

  var pendingExistingGarment = null;

  function showExistingGarment(garment) {
    pendingExistingGarment = garment;
    showScreen('existingGarment');

    existBarcode.textContent = 'Barcode: ' + garment.barcode;

    var rows = [];
    if (garment.garment_type) rows.push({ label: 'Type', value: garment.garment_type });
    if (garment.color) rows.push({ label: 'Color', value: garment.color });
    if (garment.brand) rows.push({ label: 'Brand', value: garment.brand });
    if (garment.fiber_content) rows.push({ label: 'Fiber', value: garment.fiber_content });
    if (garment.care_dry_clean) rows.push({ label: 'Dry Clean', value: garment.care_dry_clean });
    if (garment.care_washing) rows.push({ label: 'Washing', value: garment.care_washing });
    if (garment.care_drying) rows.push({ label: 'Drying', value: garment.care_drying });
    if (garment.care_ironing) rows.push({ label: 'Ironing', value: garment.care_ironing });
    if (garment.care_bleaching) rows.push({ label: 'Bleaching', value: garment.care_bleaching });
    if (garment.last_checked_in) {
      rows.push({ label: 'Last checked in', value: new Date(garment.last_checked_in).toLocaleDateString() });
    }

    existDetails.innerHTML = rows.map(function (r) {
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(r.label) + '</span><span class="detail-value">' + escapeHtml(r.value) + '</span></div>';
    }).join('');

    existPhotos.innerHTML = '';
    if (garment.photo_front_url) {
      var img = document.createElement('img');
      img.src = garment.photo_front_url;
      img.alt = 'Front photo';
      existPhotos.appendChild(img);
    }
    if (garment.photo_label_url) {
      var img2 = document.createElement('img');
      img2.src = garment.photo_label_url;
      img2.alt = 'Label photo';
      existPhotos.appendChild(img2);
    }
  }

  btnAddExisting.addEventListener('click', function () {
    if (!pendingExistingGarment || !currentOrder) return;
    var g = pendingExistingGarment;
    addGarmentToOrder(g.barcode, {
      barcode: g.barcode,
      garmentType: g.garment_type || '',
      color: g.color || '',
      brand: g.brand || '',
      fiberContent: g.fiber_content || '',
      dryClean: g.care_dry_clean || '',
      washing: g.care_washing || '',
      drying: g.care_drying || '',
      ironing: g.care_ironing || '',
      bleaching: g.care_bleaching || '',
    });
  });

  btnRescanExisting.addEventListener('click', function () {
    if (!pendingExistingGarment) return;
    currentGarmentBarcode = pendingExistingGarment.barcode;
    isRescan = true;
    goToCameraCapture();
  });

  btnExistBack.addEventListener('click', function () {
    enterGarmentScreen();
  });

  // ========================================
  // ADD GARMENT TO ORDER (shared)
  // ========================================

  function addGarmentToOrder(barcode, garmentData) {
    fetch('/api/order/' + currentOrder.id + '/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garment_barcode: barcode }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) console.error('Order item save error:', data.error);
      })
      .catch(function (err) {
        console.error('Order item save error:', err);
      });

    currentOrder.items.push(garmentData);
    enterGarmentScreen();
  }

  // ========================================
  // SCREEN 4: CAMERA CAPTURE
  // ========================================

  function goToCameraCapture() {
    showScreen('camera');
    cameraOrderNum.textContent = currentOrder.orderNumber + ' \u2014 ' + currentOrder.customerName;
    cameraGarmentBarcode.textContent = 'New Garment: ' + currentGarmentBarcode;

    // Reset capture state
    currentGarment = createEmptyGarment();
    lastGarmentPhoto = null;
    lastLabelPhoto = null;
    clearAllFields();
    resetAllSections();

    initCamera().then(function () {
      transitionCapture(CAPTURE_STATES.GARMENT_SCAN);
    });
  }

  async function initCamera() {
    if (cameraInitialized) return;
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      var devices = await navigator.mediaDevices.enumerateDevices();
      var videoDevices = devices.filter(function (d) { return d.kind === 'videoinput'; });
      cameraSelect.innerHTML = '';
      videoDevices.forEach(function (device, i) {
        var option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || 'Camera ' + (i + 1);
        cameraSelect.appendChild(option);
      });
      if (videoDevices.length > 0) {
        cameraSelect.value = videoDevices[videoDevices.length - 1].deviceId;
      }
      await startCamera(cameraSelect.value);
      cameraInitialized = true;
    } catch (err) {
      console.error('Camera init failed:', err);
      statePrompt.textContent = 'Camera access denied';
    }
  }

  async function startCamera(deviceId) {
    if (cameraFeed.srcObject) {
      cameraFeed.srcObject.getTracks().forEach(function (t) { t.stop(); });
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      cameraFeed.srcObject = stream;
      await cameraFeed.play();
    } catch (err) {
      console.error('Camera start failed:', err);
      statePrompt.textContent = 'Failed to start camera';
    }
  }

  cameraSelect.addEventListener('change', function () { startCamera(cameraSelect.value); });
  stabilitySelect.addEventListener('change', function () {
    stabilityWindow = parseInt(stabilitySelect.value);
    consecutiveDetections = 0;
    updateStabilityMeter();
  });

  // ---- CAPTURE STATE MACHINE (Progressive Disclosure) ----
  function transitionCapture(state) {
    captureState = state;
    consecutiveDetections = 0;
    isProcessing = false;
    setBracketState(null);
    setDetectionText('');
    hideStabilityMeter();
    stopProgressiveText();

    // Update progress dots (5 steps)
    progDots.forEach(function (dot) {
      var s = parseInt(dot.dataset.step);
      dot.classList.remove('active', 'done');
      if (s < state) dot.classList.add('done');
      if (s === state) dot.classList.add('active');
    });

    damageControls.classList.add('hidden');
    btnCameraBack.style.display = state > CAPTURE_STATES.GARMENT_SCAN ? '' : 'none';

    switch (state) {
      case CAPTURE_STATES.GARMENT_SCAN:
        statePrompt.textContent = 'Place garment in frame';
        resetAllSections();
        setSectionState(secScan, 'active');
        scanStatusText.textContent = 'Place garment in frame';
        startAutoScan();
        break;

      case CAPTURE_STATES.GARMENT_REVIEW:
        statePrompt.textContent = 'Review garment info';
        resetAllSections();
        setSectionState(secGarment, 'active');
        garmentActions.style.display = '';
        stopAutoScan();
        setBracketState('captured');
        break;

      case CAPTURE_STATES.DAMAGE_CAPTURE:
        statePrompt.textContent = 'Any damage? Capture or skip';
        resetAllSections();
        setSectionState(secGarment, 'collapsed');
        garmentSummaryText.textContent = buildGarmentSummary();
        setSectionState(secDamage, 'active');
        damageControls.classList.remove('hidden');
        stopAutoScan();
        setBracketState(null);
        break;

      case CAPTURE_STATES.CARE_LABEL:
        statePrompt.textContent = 'Show care label to camera';
        resetAllSections();
        setSectionState(secGarment, 'collapsed');
        garmentSummaryText.textContent = buildGarmentSummary();
        setSectionState(secDamage, 'collapsed');
        damageSummaryText.textContent = buildDamageSummary();
        setSectionState(secCare, 'active');
        if (careStatusText) careStatusText.textContent = 'Show care label to camera...';
        startAutoScan();
        break;

      case CAPTURE_STATES.CAPTURE_COMPLETE:
        statePrompt.textContent = 'Review and confirm';
        resetAllSections();
        setSectionState(secGarment, 'review');
        garmentSummaryText.textContent = buildGarmentSummary();
        garmentActions.style.display = 'none';
        setSectionState(secDamage, 'review');
        damageSummaryText.textContent = buildDamageSummary();
        setSectionState(secCare, 'review');
        careSummaryText.textContent = buildCareSummary();
        setSectionState(secConfirm, 'active');
        confirmSummary.innerHTML = buildConfirmSummaryHtml();
        stopAutoScan();
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
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  }

  async function autoScanTick() {
    if (isProcessing) return;
    if (cameraFeed.videoWidth === 0) return;
    var image = captureFrame();
    var mode = captureState === CAPTURE_STATES.GARMENT_SCAN ? 'garment' : 'label';
    isProcessing = true;

    try {
      var resp = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: image, mode: mode }),
      });
      var result = await resp.json();

      if (!resp.ok) {
        setDetectionText(result.error || 'API error');
        detectionIndicator.classList.add('error');
        consecutiveDetections = 0;
        updateStabilityMeter();
        setBracketState(null);
        return;
      }

      detectionIndicator.classList.remove('error');

      if (result.detected) {
        var prev = consecutiveDetections;
        consecutiveDetections++;
        updateStabilityMeter();
        if (prev === 0) playDetectionTick();

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
        consecutiveDetections = 0;
        updateStabilityMeter();
        setBracketState(null);
        setDetectionText('Watching...');
      }
    } catch (err) {
      setDetectionText('Network error');
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

    if (captureState === CAPTURE_STATES.GARMENT_SCAN) {
      lastGarmentPhoto = image;
      await analyzeGarment(image);
    } else if (captureState === CAPTURE_STATES.CARE_LABEL) {
      lastLabelPhoto = image;
      await analyzeLabel(image);
    }
  }

  // ---- STABILITY METER ----
  function updateStabilityMeter() {
    var pct = stabilityWindow > 0 ? Math.min(100, (consecutiveDetections / stabilityWindow) * 100) : 0;
    stabilityFill.style.width = pct + '%';
    stabilityFill.classList.remove('low', 'medium', 'high');
    if (consecutiveDetections >= stabilityWindow) stabilityFill.classList.add('high');
    else if (consecutiveDetections > 0) stabilityFill.classList.add('medium');
    else stabilityFill.classList.add('low');

    if (consecutiveDetections >= stabilityWindow) stabilityText.textContent = 'CAPTURING';
    else if (consecutiveDetections > 0) stabilityText.textContent = consecutiveDetections + '/' + stabilityWindow + ' STABLE';
    else stabilityText.textContent = 'SEARCHING';
  }

  function showStabilityMeter() { stabilityMeter.classList.add('visible'); }
  function hideStabilityMeter() { stabilityMeter.classList.remove('visible'); consecutiveDetections = 0; updateStabilityMeter(); }

  // ---- CAMERA HELPERS ----
  function captureFrame() {
    var ctx = captureCanvas.getContext('2d');
    captureCanvas.width = cameraFeed.videoWidth;
    captureCanvas.height = cameraFeed.videoHeight;
    ctx.drawImage(cameraFeed, 0, 0);
    return captureCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  function triggerFlash() {
    flashOverlay.classList.add('flash');
    setTimeout(function () { flashOverlay.classList.remove('flash'); }, 200);
  }

  function setBracketState(state) {
    brackets.forEach(function (b) { b.classList.remove('detecting', 'locking', 'captured'); if (state) b.classList.add(state); });
  }

  function setDetectionText(text) {
    detectionIndicator.textContent = text;
    detectionIndicator.classList.toggle('visible', !!text);
  }

  function startProgressiveText(texts) {
    var idx = 0;
    stopProgressiveText();
    statePrompt.innerHTML = '<span class="spinner"></span> ' + texts[0];
    processingTextInterval = setInterval(function () {
      idx++;
      if (idx < texts.length) statePrompt.innerHTML = '<span class="spinner"></span> ' + texts[idx];
    }, 1200);
  }
  function stopProgressiveText() { if (processingTextInterval) { clearInterval(processingTextInterval); processingTextInterval = null; } }

  // ---- AI ANALYSIS ----
  async function analyzeGarment(image) {
    startProgressiveText(['Identifying garment...', 'Classifying type & color...', 'Checking for brand...']);
    scanStatusText.textContent = 'Analyzing garment...';
    try {
      var resp = await fetch('/api/analyze/garment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: image }) });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Garment analysis failed');
      stopProgressiveText();
      currentGarment.garmentType = data.garmentType || '';
      currentGarment.color = data.color || '';
      currentGarment.brand = data.brand || '';
      setFieldValue(fields.type, data.garmentType);
      setFieldValue(fields.color, data.color);
      setFieldValue(fields.brand, data.brand);
      transitionCapture(CAPTURE_STATES.GARMENT_REVIEW);
    } catch (err) {
      stopProgressiveText();
      statePrompt.textContent = err.message || 'Analysis failed \u2014 retrying...';
      scanStatusText.textContent = 'Scan failed \u2014 retrying...';
      consecutiveDetections = 0;
      startAutoScan();
    }
  }

  async function analyzeDamage(image) {
    isProcessing = true;
    statePrompt.innerHTML = '<span class="spinner"></span> Analyzing damage...';
    btnCaptureDamage.disabled = true;
    try {
      var resp = await fetch('/api/analyze/damage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: image }) });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Damage analysis failed');
      currentGarment.damages.push(data);
      var placeholder = damageList.querySelector('.placeholder-text');
      if (placeholder) placeholder.remove();
      var div = document.createElement('div');
      div.className = 'damage-entry';
      div.innerHTML = '<div class="damage-time">' + (data.severity || '') + ' ' + (data.type || '') + '</div><div class="damage-desc">' + (data.location ? data.location + ': ' : '') + (data.description || '') + '</div>';
      damageList.appendChild(div);
      triggerFlash();
      statePrompt.textContent = 'Damage recorded. Capture more or skip.';
    } catch (err) {
      statePrompt.textContent = err.message || 'Damage capture failed.';
    } finally {
      isProcessing = false;
      btnCaptureDamage.disabled = false;
    }
  }

  async function analyzeLabel(image) {
    startProgressiveText(['Reading care symbols...', 'Extracting fiber content...', 'Interpreting instructions...']);
    if (careStatusText) careStatusText.textContent = 'Analyzing care label...';
    try {
      var resp = await fetch('/api/analyze/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: image }) });
      var data = await resp.json();
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
      transitionCapture(CAPTURE_STATES.CAPTURE_COMPLETE);
    } catch (err) {
      stopProgressiveText();
      statePrompt.textContent = err.message || 'Label read failed \u2014 retrying...';
      if (careStatusText) careStatusText.textContent = 'Scan failed \u2014 retrying...';
      consecutiveDetections = 0;
      startAutoScan();
    }
  }

  // ---- CAMERA SCREEN BUTTONS ----
  btnCaptureDamage.addEventListener('click', function () {
    if (isProcessing || cameraFeed.videoWidth === 0) return;
    analyzeDamage(captureFrame());
  });

  btnSkipDamage.addEventListener('click', function () {
    transitionCapture(CAPTURE_STATES.CARE_LABEL);
  });

  btnGarmentOk.addEventListener('click', function () {
    transitionCapture(CAPTURE_STATES.DAMAGE_CAPTURE);
  });

  btnGarmentRescan.addEventListener('click', function () {
    // Clear garment fields and re-scan
    fields.type.value = '';
    fields.type.classList.remove('populated');
    fields.color.value = '';
    fields.color.classList.remove('populated');
    fields.brand.value = '';
    fields.brand.classList.remove('populated');
    currentGarment.garmentType = '';
    currentGarment.color = '';
    currentGarment.brand = '';
    lastGarmentPhoto = null;
    transitionCapture(CAPTURE_STATES.GARMENT_SCAN);
  });

  btnDamageDone.addEventListener('click', function () {
    transitionCapture(CAPTURE_STATES.CARE_LABEL);
  });

  btnCameraBack.addEventListener('click', function () {
    stopAutoScan();
    isProcessing = false;
    stopProgressiveText();
    if (captureState === CAPTURE_STATES.GARMENT_REVIEW) {
      transitionCapture(CAPTURE_STATES.GARMENT_SCAN);
    } else if (captureState === CAPTURE_STATES.DAMAGE_CAPTURE) {
      transitionCapture(CAPTURE_STATES.GARMENT_REVIEW);
    } else if (captureState === CAPTURE_STATES.CARE_LABEL) {
      transitionCapture(CAPTURE_STATES.DAMAGE_CAPTURE);
    } else if (captureState === CAPTURE_STATES.CAPTURE_COMPLETE) {
      transitionCapture(CAPTURE_STATES.CARE_LABEL);
    }
  });

  btnConfirmAdd.addEventListener('click', function () {
    stopAutoScan();

    // Read field values (staff may have edited)
    currentGarment.garmentType = fields.type.value;
    currentGarment.color = fields.color.value;
    currentGarment.brand = fields.brand.value;
    currentGarment.fiberContent = fields.fiber.value;
    currentGarment.dryClean = fields.dryClean.value;
    currentGarment.washing = fields.washing.value;
    currentGarment.drying = fields.drying.value;
    currentGarment.ironing = fields.ironing.value;
    currentGarment.bleaching = fields.bleaching.value;
    currentGarment.barcode = currentGarmentBarcode;

    // Save garment to DB
    saveGarmentToDatabase(currentGarment);

    // Add to order
    addGarmentToOrder(currentGarmentBarcode, { ...currentGarment });
  });

  // ---- SAVE GARMENT TO DB ----
  function saveGarmentToDatabase(garment) {
    var payload = {
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
        ? garment.damages.map(function (d) { return (d.severity || '') + ' ' + (d.type || '') + (d.location ? ' at ' + d.location : ''); }).join('; ')
        : null,
      photos: {},
    };
    if (lastGarmentPhoto) payload.photos.front = lastGarmentPhoto;
    if (lastLabelPhoto) payload.photos.label = lastLabelPhoto;

    fetch('/api/garment/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) console.log('Garment saved:', garment.barcode);
        else console.error('Garment save error:', data.error);
      })
      .catch(function (err) {
        console.error('Garment save error:', err);
      });
  }

  // ========================================
  // SCREEN 5: ORDER REVIEW
  // ========================================

  function showReviewScreen() {
    showScreen('review');
    reviewOrderInfo.innerHTML =
      '<strong>' + escapeHtml(currentOrder.orderNumber) + '</strong><br>' +
      'Customer: ' + escapeHtml(currentOrder.customerName);

    renderReviewItems();
  }

  function renderReviewItems() {
    reviewItemsList.innerHTML = '';

    if (currentOrder.items.length === 0) {
      reviewItemsList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">No items in order</p>';
      return;
    }

    currentOrder.items.forEach(function (item, idx) {
      var card = document.createElement('div');
      card.className = 'review-card';
      card.innerHTML =
        '<div class="review-card-info">' +
        '<div class="review-card-title">' + (idx + 1) + '. ' + escapeHtml(item.color || '') + ' ' + escapeHtml(item.garmentType || 'Garment') + '</div>' +
        '<div class="review-card-sub">' + escapeHtml(item.barcode || '') +
        (item.brand ? ' \u2014 ' + escapeHtml(item.brand) : '') +
        (item.dryClean && item.dryClean !== 'Not specified' ? ' \u2014 ' + escapeHtml(item.dryClean) : '') +
        '</div></div>' +
        '<button class="btn-remove" data-idx="' + idx + '">Remove</button>';
      reviewItemsList.appendChild(card);
    });

    reviewItemsList.querySelectorAll('.btn-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.dataset.idx);
        var removed = currentOrder.items[i];
        if (!removed) return;
        fetch('/api/order/' + currentOrder.id + '/items/' + encodeURIComponent(removed.barcode), { method: 'DELETE' })
          .catch(function (err) { console.error('Remove item error:', err); });
        currentOrder.items.splice(i, 1);
        renderReviewItems();
      });
    });
  }

  btnCompleteOrder.addEventListener('click', function () {
    btnCompleteOrder.disabled = true;
    btnCompleteOrder.textContent = 'COMPLETING...';

    fetch('/api/order/' + currentOrder.id + '/complete', { method: 'PATCH' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        orderCompleteToast.classList.remove('hidden');
        setTimeout(function () {
          orderCompleteToast.classList.add('hidden');
          currentOrder = null;
          showScreen('start');
        }, 2000);
      })
      .catch(function (err) {
        alert('Error completing order: ' + err.message);
      })
      .finally(function () {
        btnCompleteOrder.disabled = false;
        btnCompleteOrder.textContent = 'COMPLETE ORDER';
      });
  });

  btnSendSmrt.addEventListener('click', function () {
    alert('Coming soon \u2014 SMRT integration will be available in a future update.');
  });

  btnReviewBack.addEventListener('click', function () {
    enterGarmentScreen();
  });

  // ========================================
  // INIT
  // ========================================
  showScreen('start');

})();
