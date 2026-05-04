/* ============================================
   PARSELFEE - Frontend Application
   All data from API, no localStorage
   ============================================ */

let currentUser = null;
let currentPage = 'auth';
let currentFilter = 'all';
let currentUrgencyFilter = 'all';
let currentOrderSort = 'newest';
let browseSearchTerm = '';
let browseSearchTimer = null;
let currentOrderTab = 'placed';
let trackingWatchId = null;
let trackingOrderId = null;
let trackingMap = null;
let trackingMarker = null;
let appConfig = null;
let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 30000;

// ---- API HELPER ----
function getCookie(name) {
    return document.cookie
        .split(';')
        .map(part => part.trim())
        .find(part => part.startsWith(name + '='))
        ?.slice(name.length + 1) || '';
}

async function api(path, options = {}) {
    const csrfCookieName = appConfig?.csrf?.cookieName;
    const csrfHeaderName = appConfig?.csrf?.headerName;
    const csrfToken = csrfCookieName ? getCookie(csrfCookieName) : '';
    const headers = {
        'Content-Type': 'application/json',
        ...(csrfToken ? { [csrfHeaderName]: decodeURIComponent(csrfToken) } : {}),
        ...(options.headers || {})
    };

    const res = await fetch('/api' + path, {
        ...options,
        headers,
        credentials: 'same-origin',
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

async function loadAppConfig() {
    const data = await api('/config');
    appConfig = data;
    applyAppConfig();
}

function applyAppConfig() {
    if (!appConfig) return;

    const domains = appConfig.auth.allowedEmailDomains.map(domain => '@' + domain).join(', ');
    const domainText = domains ? `Only ${domains} emails allowed.` : 'Use an approved email domain.';
    const loginDomainNote = document.getElementById('loginDomainNote');
    const signupDomainNote = document.getElementById('signupDomainNote');
    if (loginDomainNote) loginDomainNote.textContent = domainText;
    if (signupDomainNote) signupDomainNote.textContent = domainText;

    const emailPlaceholder = appConfig.auth.allowedEmailDomains[0] ? `you@${appConfig.auth.allowedEmailDomains[0]}` : 'you@example.com';
    document.getElementById('loginEmail').placeholder = emailPlaceholder;
    document.getElementById('signupEmail').placeholder = emailPlaceholder;

    const signupName = document.getElementById('signupName');
    signupName.minLength = appConfig.auth.nameMinLength;
    signupName.maxLength = appConfig.auth.nameMaxLength;

    const signupPassword = document.getElementById('signupPassword');
    signupPassword.minLength = appConfig.auth.passwordMinLength;
    signupPassword.maxLength = appConfig.auth.passwordMaxLength;
    signupPassword.placeholder = `${appConfig.auth.passwordMinLength}-${appConfig.auth.passwordMaxLength} characters`;

    document.getElementById('itemDesc').maxLength = appConfig.orders.maxTextLength;
    document.getElementById('roomDetails').maxLength = appConfig.orders.roomMaxLength;
    document.getElementById('orderNotes').maxLength = appConfig.orders.notesMaxLength;

    populateSelect('pickupLocation', appConfig.orders.pickupLocations, 'Select pickup spot');
    populateSelect('deliverTo', appConfig.orders.deliveryLocations, 'Select delivery spot');
    populateBrowseFilters();

    feeInput.min = appConfig.orders.deliveryFeeMin;
    feeInput.max = appConfig.orders.deliveryFeeMax;
    feeInput.value = appConfig.orders.deliveryFeeDefault;
    feePreview.textContent = appConfig.orders.deliveryFeeDefault;

    const suggestions = document.getElementById('feeSuggestions');
    suggestions.innerHTML = appConfig.orders.deliveryFeeSuggestions.map(amount => (
        `<button type="button" class="fee-chip" data-fee="${Number(amount)}">${rupee(Number(amount))}</button>`
    )).join('');

    updateScheduleRequirements();
}

function populateSelect(id, options, placeholder) {
    const select = document.getElementById(id);
    select.innerHTML = `<option value="">${esc(placeholder)}</option>` + options.map(option => (
        `<option value="${esc(option)}">${esc(option)}</option>`
    )).join('');
}

function populateBrowseFilters() {
    const filters = document.getElementById('browseFilters');
    const values = ['all', ...appConfig.orders.pickupLocations];
    filters.innerHTML = values.map((value, index) => {
        const label = value === 'all' ? 'All' : value;
        const activeClass = index === 0 ? ' active' : '';
        return `<button class="filter-chip${activeClass}" data-filter="${esc(value)}" type="button">${esc(label)}</button>`;
    }).join('');
}

// ---- AUTH ----
function showLogin(e) {
    if (e) e.preventDefault();
    document.getElementById('loginForm').classList.remove('hidden-form');
    document.getElementById('signupForm').classList.add('hidden-form');
    clearAuthErrors();
}

function showSignup(e) {
    if (e) e.preventDefault();
    document.getElementById('loginForm').classList.add('hidden-form');
    document.getElementById('signupForm').classList.remove('hidden-form');
    clearAuthErrors();
}

function clearAuthErrors() {
    document.getElementById('loginError').textContent = '';
    document.getElementById('signupError').textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!validateEmailDomain(email)) {
        errorEl.textContent = getAllowedEmailMessage();
        return;
    }

    btn.classList.add('loading');
    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        currentUser = data.user;
        onAuthSuccess();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const errorEl = document.getElementById('signupError');
    errorEl.textContent = '';

    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!validateEmailDomain(email)) {
        errorEl.textContent = getAllowedEmailMessage();
        return;
    }

    if (password.length < appConfig.auth.passwordMinLength || password.length > appConfig.auth.passwordMaxLength) {
        errorEl.textContent = `Password must be ${appConfig.auth.passwordMinLength}-${appConfig.auth.passwordMaxLength} characters.`;
        return;
    }

    btn.classList.add('loading');
    try {
        const data = await api('/auth/signup', {
            method: 'POST',
            body: { name, email, password }
        });
        currentUser = data.user;
        onAuthSuccess();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleLogout() {
    stopLiveTracking();
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch (_) {}
    currentUser = null;
    document.getElementById('navbar').classList.add('hidden');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-auth').classList.add('active');
    currentPage = 'auth';
}

function validateEmailDomain(email) {
    const domain = email.toLowerCase().split('@')[1];
    return appConfig?.auth?.allowedEmailDomains?.includes(domain);
}

function getAllowedEmailMessage() {
    const domains = appConfig?.auth?.allowedEmailDomains || [];
    return `Only ${domains.map(domain => '@' + domain).join(', ')} emails allowed.`;
}

function onAuthSuccess() {
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('navUser').textContent = currentUser.name;

    // Show mobile bottom nav
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.classList.remove('hidden');

    navigate('home');
}

// ---- CHECK SESSION ON LOAD ----
async function checkSession() {
    try {
        const data = await api('/auth/me');
        if (data.user) {
            currentUser = data.user;
            onAuthSuccess();
            return;
        }

        document.getElementById('page-auth').classList.add('active');
    } catch (_) {
        document.getElementById('page-auth').classList.add('active');
    }
}

// ---- NAVIGATION ----
function navigate(page) {
    if (!currentUser && page !== 'auth') return;

    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.add('active');
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    document.getElementById('mobileMenu').classList.remove('open');

    if (page === 'browse') renderBrowseOrders();
    if (page === 'my-orders') renderMyOrders();
    if (page === 'profile') loadProfile();
    if (page === 'home') updateHomeStats();

    // Auto-refresh browse page every 30s (like Swiggy)
    clearInterval(autoRefreshTimer);
    if (page === 'browse') {
        autoRefreshTimer = setInterval(() => {
            if (currentPage === 'browse') renderBrowseOrders();
        }, AUTO_REFRESH_MS);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('open');
}

// ---- PLACE ORDER ----
const urgencySelect = document.getElementById('urgency');
const scheduleGroup = document.getElementById('scheduleGroup');
const feeInput = document.getElementById('deliveryFee');
const feePreview = document.getElementById('feePreview');

urgencySelect.addEventListener('change', () => {
    scheduleGroup.classList.toggle('hidden-form', urgencySelect.value !== 'scheduled');
    updateScheduleRequirements();
});

feeInput.addEventListener('input', () => {
    feePreview.textContent = feeInput.value || '0';
});

function setFee(amount) {
    feeInput.value = amount;
    feePreview.textContent = amount;
}

function updateScheduleRequirements() {
    const scheduleInput = document.getElementById('scheduleTime');
    if (!scheduleInput) return;

    const required = urgencySelect.value === 'scheduled';
    scheduleInput.required = required;

    const leadMinutes = appConfig?.orders?.scheduleLeadMinutes || 0;
    const soon = new Date(Date.now() + leadMinutes * 60 * 1000);
    soon.setSeconds(0, 0);
    scheduleInput.min = toDateTimeLocalValue(soon);
}

async function placeOrder(e) {
    e.preventDefault();
    const btn = document.getElementById('placeOrderBtn');
    btn.classList.add('loading');

    try {
        const body = {
            item_desc: document.getElementById('itemDesc').value.trim(),
            pickup_location: document.getElementById('pickupLocation').value,
            deliver_to: document.getElementById('deliverTo').value,
            room_details: document.getElementById('roomDetails').value.trim(),
            delivery_fee: parseInt(feeInput.value) || appConfig.orders.deliveryFeeDefault,
            urgency: urgencySelect.value,
            schedule_time: getScheduleTimeForApi(),
            notes: document.getElementById('orderNotes').value.trim()
        };

        const data = await api('/orders', { method: 'POST', body });
        showToast('Order posted! ' + data.order.order_code, 'success');
        burstConfetti();
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        document.getElementById('orderForm').reset();
        feeInput.value = appConfig.orders.deliveryFeeDefault;
        feePreview.textContent = appConfig.orders.deliveryFeeDefault;
        scheduleGroup.classList.add('hidden-form');
        navigate('my-orders');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
}

// ---- BROWSE ORDERS ----
function filterOrders(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderBrowseOrders();
}

function setUrgencyFilter(value) {
    currentUrgencyFilter = value || 'all';
    renderBrowseOrders();
}

function setOrderSort(value) {
    currentOrderSort = value || 'newest';
    renderBrowseOrders();
}

function handleBrowseSearch() {
    const input = document.getElementById('orderSearch');
    browseSearchTerm = input ? input.value.trim() : '';
    clearTimeout(browseSearchTimer);
    browseSearchTimer = setTimeout(renderBrowseOrders, 250);
}

async function renderBrowseOrders() {
    const grid = document.getElementById('browseOrdersGrid');
    const empty = document.getElementById('browseEmpty');

    // Show skeleton while loading
    showSkeletonCards('browseOrdersGrid', 4);
    empty.classList.add('hidden');

    try {
        const params = new URLSearchParams({ status: 'open', sort: currentOrderSort });
        if (currentFilter !== 'all') params.set('pickup', currentFilter);
        if (currentUrgencyFilter !== 'all') params.set('urgency', currentUrgencyFilter);
        if (browseSearchTerm) params.set('q', browseSearchTerm);

        const data = await api('/orders?' + params.toString());
        const orders = data.orders;

        if (orders.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        grid.innerHTML = orders.map((order, i) => `
            <div class="order-card stagger-${Math.min(i, 12)}" data-order-id="${order.id}">
                <div class="order-card-header">
                    <div>
                        <div class="order-card-title">${esc(order.item_desc)}</div>
                        <span class="mini-status status-active">Open</span>
                    </div>
                    <div class="order-card-fee">${rupee(order.delivery_fee)}</div>
                </div>
                <div class="order-card-meta">
                    <div class="order-meta-row">
                        <span class="order-meta-icon">&#x1F4CD;</span>
                        <span>Pickup: ${esc(order.pickup_location)}</span>
                    </div>
                    <div class="order-meta-row">
                        <span class="order-meta-icon">&#x1F3E0;</span>
                        <span>Deliver: ${esc(order.deliver_to)} &mdash; ${esc(order.room_details)}</span>
                    </div>
                    <div class="order-meta-row">
                        <span class="order-meta-icon">&#x23F0;</span>
                        <span>${formatUrgency(order)}</span>
                    </div>
                    <div class="order-meta-row">
                        <span class="order-meta-icon">&#x1F464;</span>
                        <span>by ${esc(order.placer_name)}</span>
                    </div>
                </div>
                <div class="order-card-footer">
                    <span class="order-time">${timeAgo(order.created_at)}</span>
                    <button class="btn btn-primary btn-sm" data-action="accept-order" data-order-id="${order.id}" type="button">
                        Accept Delivery &rarr;
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
    }
}

// ---- MY ORDERS ----
function switchOrderTab(tab, btn) {
    currentOrderTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMyOrders();
}

async function renderMyOrders() {
    const list = document.getElementById('myOrdersList');
    const empty = document.getElementById('myOrdersEmpty');

    try {
        const data = await api('/orders/mine?type=' + currentOrderTab);
        const orders = data.orders;

        if (orders.length === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        list.innerHTML = orders.map(order => `
            <div class="order-list-item" data-order-id="${order.id}">
                <span class="order-list-emoji">${getEmoji(order.item_desc)}</span>
                <div class="order-list-info">
                    <h4>${esc(order.item_desc)}</h4>
                    <p>${esc(order.pickup_location)} &rarr; ${esc(order.deliver_to)} &middot; ${timeAgo(order.created_at)}</p>
                </div>
                <div class="order-list-fee">${rupee(order.delivery_fee)}</div>
                <span class="mini-status status-${getStatusClass(order.status)}">${formatStatus(order.status)}</span>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
    }
}

// ---- ORDER DETAIL MODAL ----
async function openOrderDetail(orderId) {
    try {
        destroyTrackingMap();
        const data = await api('/orders/' + orderId);
        const order = data.order;
        const modal = document.getElementById('modalBody');
        const isPlacer = currentUser && order.placer_id === currentUser.id;
        const isAccepter = currentUser && order.accepter_id === currentUser.id;

        let actionsHtml = '';

        if (order.status === 'open' && !isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-primary btn-lg" data-action="accept-order" data-order-id="${order.id}" type="button">Accept & Deliver &rarr;</button>
            </div>`;
        } else if (order.status === 'open' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-danger" data-action="update-status" data-order-id="${order.id}" data-status="cancelled" type="button">Cancel Order</button>
            </div>`;
        } else if (order.status === 'accepted' && isAccepter) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-primary" data-action="update-status" data-order-id="${order.id}" data-status="picked_up" type="button">Mark Picked Up</button>
            </div>`;
        } else if (order.status === 'accepted' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-outline" data-action="open-order" data-order-id="${order.id}" type="button">Refresh Location</button>
            </div>
            <p class="text-secondary mt-2">Waiting for pickup by ${esc(order.accepter_name || 'deliverer')}...</p>`;
        } else if (order.status === 'picked_up' && isAccepter) {
            actionsHtml = `<div class="pin-entry-wrap">
                <label class="pin-entry-label" for="deliveryPinInput">Requester Delivery PIN</label>
                <input id="deliveryPinInput" class="form-input" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit PIN">
            </div>
            <div class="modal-actions">
                <button class="btn btn-success btn-lg" data-action="confirm-delivery" data-order-id="${order.id}" type="button">Confirm Delivered &#x2713;</button>
            </div>`;
        } else if (order.status === 'picked_up' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-outline" data-action="open-order" data-order-id="${order.id}" type="button">Refresh Location</button>
            </div>
            <p class="text-amber mt-2">&#x1F6B6; On the way to you!</p>`;
        } else if (order.status === 'delivered') {
            actionsHtml = `<p class="text-green mt-2">&#x2705; Delivered successfully!</p>`;
        } else if (order.status === 'cancelled') {
            actionsHtml = `<p class="text-coral mt-2">Cancelled</p>`;
        }

        const hasTracking = Number.isFinite(Number(order.tracking_lat)) && Number.isFinite(Number(order.tracking_lng));
        const trackingLat = Number(order.tracking_lat);
        const trackingLng = Number(order.tracking_lng);
        const isTrackable = order.status === 'accepted' || order.status === 'picked_up';
        const mapOpen = hasTracking ? buildMapOpenUrl(trackingLat, trackingLng) : '';

        const trackingHtml = order.accepter_id && isTrackable ? `
            <div class="tracking-card">
                <div class="tracking-title">Live Tracking</div>
                ${hasTracking ? `
                    <div id="trackingMapCanvas" class="tracking-map" aria-label="Live delivery map"></div>
                    <div class="tracking-meta">
                        <span id="trackingLastUpdated">Last update: ${formatTrackingTime(order.tracking_updated_at)}</span>
                        <a id="trackingOpenMapLink" href="${mapOpen}" target="_blank" rel="noopener noreferrer">Open full map</a>
                    </div>
                ` : `
                    <p class="text-secondary mt-1">No location shared yet. Ask the deliverer to start live tracking.</p>
                `}
                ${isAccepter ? `
                    <div class="tracking-actions">
                        <button class="btn btn-outline btn-sm" data-action="share-location" data-order-id="${order.id}" type="button">Share Now</button>
                        <button class="btn btn-outline btn-sm" data-action="start-tracking" data-order-id="${order.id}" type="button">Start Live</button>
                        <button class="btn btn-outline btn-sm" data-action="stop-tracking" type="button">Stop Live</button>
                    </div>
                ` : ''}
            </div>
        ` : '';

        const pinHtml = isPlacer && order.delivery_pin && isTrackable ? `
            <div class="pin-display-card">
                <div class="pin-display-label">Handoff Security PIN</div>
                <div class="pin-display-value">${esc(order.delivery_pin)}</div>
                <p class="text-secondary mt-1">Only share this code after you receive your order.</p>
            </div>
        ` : '';

        modal.innerHTML = `
            <h2 class="modal-title">${getEmoji(order.item_desc)} ${esc(order.item_desc)}</h2>

            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F4CD;</span>
                <div>
                    <span class="modal-detail-label">Pickup From</span>
                    <span class="modal-detail-value">${esc(order.pickup_location)}</span>
                </div>
            </div>

            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F3E0;</span>
                <div>
                    <span class="modal-detail-label">Deliver To</span>
                    <span class="modal-detail-value">${esc(order.deliver_to)} &mdash; ${esc(order.room_details)}</span>
                </div>
            </div>

            <div class="modal-detail">
                <span class="modal-detail-icon">&#x23F0;</span>
                <div>
                    <span class="modal-detail-label">Timing</span>
                    <span class="modal-detail-value">${formatUrgency(order)}</span>
                </div>
            </div>

            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F4CB;</span>
                <div>
                    <span class="modal-detail-label">Status</span>
                    <span class="mini-status status-${getStatusClass(order.status)}">${formatStatus(order.status)}</span>
                </div>
            </div>

            ${renderStatusTimeline(order.status)}

            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F464;</span>
                <div>
                    <span class="modal-detail-label">Placed By</span>
                    <span class="modal-detail-value">${esc(order.placer_name)}</span>
                </div>
            </div>

            ${order.notes ? `
            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F4DD;</span>
                <div>
                    <span class="modal-detail-label">Notes</span>
                    <span class="modal-detail-value">${esc(order.notes)}</span>
                </div>
            </div>` : ''}

            ${order.accepter_name ? `
            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F91D;</span>
                <div>
                    <span class="modal-detail-label">Delivering</span>
                    <span class="modal-detail-value">${esc(order.accepter_name)}</span>
                </div>
            </div>` : ''}

            ${order.placer_phone && isAccepter ? `
            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F4DE;</span>
                <div>
                    <span class="modal-detail-label">Contact</span>
                    <span class="modal-detail-value">${esc(order.placer_phone)}</span>
                </div>
            </div>` : ''}

            ${order.accepter_phone && isPlacer ? `
            <div class="modal-detail">
                <span class="modal-detail-icon">&#x1F4DE;</span>
                <div>
                    <span class="modal-detail-label">Deliverer Contact</span>
                    <span class="modal-detail-value">${esc(order.accepter_phone)}</span>
                </div>
            </div>` : ''}

            <div class="modal-fee">
                <div class="modal-fee-label">Delivery Fee</div>
                <div class="modal-fee-amount">${rupee(order.delivery_fee)}</div>
            </div>

            ${trackingHtml}
            ${pinHtml}

            <div class="modal-order-code">
                <span class="text-dim modal-order-code-text">Order ${esc(order.order_code)} &middot; ${new Date(order.created_at).toLocaleString()}</span>
            </div>

            ${actionsHtml}
        `;

        document.getElementById('modalOverlay').classList.add('open');

        if (hasTracking) {
            initTrackingMap(trackingLat, trackingLng);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function closeModal() {
    stopLiveTracking();
    destroyTrackingMap();
    document.getElementById('modalOverlay').classList.remove('open');
}

function buildMapOpenUrl(lat, lng) {
    const latText = lat.toFixed(6);
    const lngText = lng.toFixed(6);
    return `https://www.openstreetmap.org/?mlat=${latText}&mlon=${lngText}#map=18/${latText}/${lngText}`;
}

function initTrackingMap(lat, lng) {
    const mapEl = document.getElementById('trackingMapCanvas');
    if (!mapEl) return;

    if (!window.L) {
        const meta = document.getElementById('trackingLastUpdated');
        if (meta) meta.textContent = 'Map failed to load. Use "Open full map".';
        return;
    }

    destroyTrackingMap();

    trackingMap = window.L.map(mapEl, { zoomControl: true, attributionControl: true });
    window.L.tileLayer(appConfig.map.tileUrl, {
        maxZoom: appConfig.map.maxZoom,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(trackingMap);

    trackingMarker = window.L.circleMarker([lat, lng], {
        radius: 8,
        color: '#f2a154',
        fillColor: '#f2a154',
        fillOpacity: 0.95,
        weight: 2
    }).addTo(trackingMap);

    trackingMap.setView([lat, lng], appConfig.map.defaultZoom);
    setTimeout(() => {
        if (trackingMap) trackingMap.invalidateSize();
    }, 100);
}

function updateTrackingMap(lat, lng) {
    if (!trackingMap || !trackingMarker) return;
    trackingMarker.setLatLng([lat, lng]);
    trackingMap.panTo([lat, lng], { animate: true, duration: 0.4 });

    const updated = document.getElementById('trackingLastUpdated');
    if (updated) updated.textContent = `Last update: ${formatTrackingTime(new Date().toISOString())}`;

    const link = document.getElementById('trackingOpenMapLink');
    if (link) link.href = buildMapOpenUrl(lat, lng);
}

function destroyTrackingMap() {
    if (trackingMap) {
        trackingMap.remove();
    }
    trackingMap = null;
    trackingMarker = null;
}

function formatTrackingTime(value) {
    if (!value) return 'just now';
    const date = parseUtcDate(value);
    if (Number.isNaN(date.getTime())) return 'recently';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function shareCurrentLocation(orderId) {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported on this device.', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(async pos => {
        try {
            await api('/orders/' + orderId + '/location', {
                method: 'PATCH',
                body: { lat: pos.coords.latitude, lng: pos.coords.longitude }
            });
            updateTrackingMap(pos.coords.latitude, pos.coords.longitude);
            showToast('Location updated.', 'success');
            openOrderDetail(orderId);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, () => {
        showToast('Unable to read location. Please allow location access.', 'error');
    }, {
        enableHighAccuracy: true,
        timeout: appConfig.geolocation.timeoutMs,
        maximumAge: appConfig.geolocation.maximumAgeMs
    });
}

function startLiveTracking(orderId) {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported on this device.', 'error');
        return;
    }

    if (trackingWatchId !== null) {
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
    }

    trackingOrderId = orderId;
    trackingWatchId = navigator.geolocation.watchPosition(async pos => {
        try {
            await api('/orders/' + orderId + '/location', {
                method: 'PATCH',
                body: { lat: pos.coords.latitude, lng: pos.coords.longitude }
            });
            updateTrackingMap(pos.coords.latitude, pos.coords.longitude);
        } catch (_) {
            // Silent during watch to avoid toast spam if network flaps.
        }
    }, () => {
        showToast('Live tracking failed. Check location permissions.', 'error');
        stopLiveTracking();
    }, {
        enableHighAccuracy: true,
        timeout: appConfig.geolocation.timeoutMs,
        maximumAge: appConfig.geolocation.maximumAgeMs
    });

    showToast('Live tracking started.', 'success');
}

function stopLiveTracking() {
    if (trackingWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(trackingWatchId);
    }
    trackingWatchId = null;
    trackingOrderId = null;
}

async function confirmDelivery(orderId) {
    const pin = (document.getElementById('deliveryPinInput')?.value || '').trim();
    if (!/^\d{6}$/.test(pin)) {
        showToast('Enter a valid 6-digit delivery PIN.', 'error');
        return;
    }
    await updateStatus(orderId, 'delivered', { delivery_pin: pin });
}

// ---- ORDER ACTIONS ----
async function acceptOrder(orderId) {
    try {
        await api('/orders/' + orderId + '/accept', { method: 'PATCH' });
        showToast('Order accepted! Go pick it up.', 'success');
        closeModal();
        if (currentPage === 'browse') renderBrowseOrders();
        if (currentPage === 'my-orders') renderMyOrders();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function updateStatus(orderId, newStatus, extraBody = {}) {
    try {
        await api('/orders/' + orderId + '/status', {
            method: 'PATCH',
            body: { status: newStatus, ...extraBody }
        });

        if (newStatus === 'delivered') {
            showToast('Delivered! Fee earned.', 'success');
            burstConfetti();
            if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 80]);
        } else if (newStatus === 'picked_up') {
            showToast('Picked up! Head to delivery spot.', 'success');
            if (navigator.vibrate) navigator.vibrate(20);
        } else if (newStatus === 'cancelled') {
            showToast('Order cancelled.', 'error');
        }

        if (newStatus === 'delivered' || newStatus === 'cancelled') {
            stopLiveTracking();
        }

        closeModal();
        if (currentPage === 'my-orders') renderMyOrders();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---- PROFILE ----
async function loadProfile() {
    try {
        const data = await api('/profile');
        const user = data.user;
        currentUser = user;

        document.getElementById('profileName').value = user.name || '';
        document.getElementById('profileEmail').value = user.email || '';
        document.getElementById('profileHostel').value = user.hostel || '';
        document.getElementById('profileRoom').value = user.room || '';
        document.getElementById('profilePhone').value = user.phone || '';
        document.getElementById('profileAvatar').textContent = (user.name || 'S')[0].toUpperCase();

        document.getElementById('walletEarned').textContent = rupee(user.total_earned || 0);
        document.getElementById('walletSpent').textContent = rupee(user.total_spent || 0);
        document.getElementById('profileDelivered').textContent = user.deliveries_done || 0;
        document.getElementById('profileOrdered').textContent = user.orders_placed || 0;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function saveProfile() {
    try {
        const body = {
            name: document.getElementById('profileName').value.trim(),
            hostel: document.getElementById('profileHostel').value.trim(),
            room: document.getElementById('profileRoom').value.trim(),
            phone: document.getElementById('profilePhone').value.trim()
        };

        const data = await api('/profile', { method: 'PATCH', body });
        currentUser = data.user;
        document.getElementById('profileAvatar').textContent = (data.user.name || 'S')[0].toUpperCase();
        document.getElementById('navUser').textContent = data.user.name;
        showToast('Profile saved!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---- HOME STATS ----
async function updateHomeStats() {
    try {
        const data = await api('/profile/stats');
        const s = data.stats;
        animateCounter('stat-orders', s.total_orders || 0);
        animateCounter('stat-delivered', s.total_delivered || 0);
        document.getElementById('stat-earned').textContent = rupee(s.total_earned || 0);
    } catch (_) {}
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 800;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    if (diff === 0) { el.textContent = target; return; }

    const startTime = performance.now();
    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + diff * eased);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ---- HELPERS ----
function rupee(n) { return '\u20B9' + n; }

function formatUrgency(order) {
    if (order.urgency === 'asap') return 'ASAP';
    if (order.urgency === '30min') return 'Within 30 mins';
    if (order.urgency === '1hr') return 'Within 1 hour';
    if (order.urgency === 'scheduled' && order.schedule_time) {
        return 'Scheduled: ' + new Date(order.schedule_time).toLocaleString();
    }
    return order.urgency;
}

function formatStatus(status) {
    return { open: 'Open', accepted: 'Accepted', picked_up: 'Picked Up', delivered: 'Delivered', cancelled: 'Cancelled' }[status] || status;
}

function getStatusClass(status) {
    return { open: 'active', accepted: 'accepted', picked_up: 'accepted', delivered: 'done', cancelled: 'cancelled' }[status] || 'active';
}

function getEmoji(desc) {
    if (!desc) return '\u{1F4E6}';
    const l = desc.toLowerCase();
    if (/food|biryani|rice|meal|thali|dosa/i.test(l)) return '\u{1F35B}';
    if (/pizza/i.test(l)) return '\u{1F355}';
    if (/burger/i.test(l)) return '\u{1F354}';
    if (/ramen|noodle|maggi/i.test(l)) return '\u{1F35C}';
    if (/coffee|chai|tea/i.test(l)) return '\u2615';
    if (/juice|drink|water/i.test(l)) return '\u{1F964}';
    if (/book|notes/i.test(l)) return '\u{1F4DA}';
    if (/medicine|med/i.test(l)) return '\u{1F48A}';
    return '\u{1F4E6}';
}

function parseUtcDate(value) {
    if (!value) return new Date(NaN);
    const raw = String(value).trim();
    if (!raw) return new Date(NaN);

    // If timezone is already present, parse as-is.
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
        return new Date(raw);
    }

    // Normalize sqlite-like timestamps before forcing UTC.
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    return new Date(normalized + 'Z');
}

function toDateTimeLocalValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getScheduleTimeForApi() {
    if (urgencySelect.value !== 'scheduled') return '';

    const raw = document.getElementById('scheduleTime').value;
    if (!raw) return '';

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = parseUtcDate(dateStr).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ---- TOAST ----
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icon = type === 'success' ? '\u2705' : '\u26A0\uFE0F';
    toast.innerHTML = `<span>${icon}</span> ${esc(message)}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

// ---- KEYBOARD ----
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    document.getElementById('orderForm').addEventListener('submit', placeOrder);
    document.getElementById('showSignupLink').addEventListener('click', showSignup);
    document.getElementById('showLoginLink').addEventListener('click', showLogin);
    document.getElementById('mobileMenuToggle').addEventListener('click', toggleMobileMenu);
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
    document.getElementById('orderSearch').addEventListener('input', handleBrowseSearch);
    document.getElementById('urgencyFilter').addEventListener('change', e => setUrgencyFilter(e.target.value));
    document.getElementById('sortOrders').addEventListener('change', e => setOrderSort(e.target.value));
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target.id === 'modalOverlay') closeModal();
    });

    document.querySelectorAll('.nav-action').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    document.querySelectorAll('.logout-action').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });

    document.querySelectorAll('[data-order-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchOrderTab(btn.dataset.orderTab, btn));
    });

    document.addEventListener('click', handleDelegatedClick);
}

function handleDelegatedClick(e) {
    const feeChip = e.target.closest('[data-fee]');
    if (feeChip) {
        setFee(Number(feeChip.dataset.fee));
        return;
    }

    const filterChip = e.target.closest('[data-filter]');
    if (filterChip) {
        filterOrders(filterChip.dataset.filter, filterChip);
        return;
    }

    const action = e.target.closest('[data-action]');
    if (action) {
        const orderId = Number(action.dataset.orderId);
        if (action.dataset.action === 'accept-order') acceptOrder(orderId);
        if (action.dataset.action === 'update-status') updateStatus(orderId, action.dataset.status);
        if (action.dataset.action === 'open-order') openOrderDetail(orderId);
        if (action.dataset.action === 'confirm-delivery') confirmDelivery(orderId);
        if (action.dataset.action === 'share-location') shareCurrentLocation(orderId);
        if (action.dataset.action === 'start-tracking') startLiveTracking(orderId);
        if (action.dataset.action === 'stop-tracking') stopLiveTracking();
        return;
    }

    const orderItem = e.target.closest('[data-order-id]');
    if (orderItem) {
        openOrderDetail(Number(orderItem.dataset.orderId));
    }
}

// ---- INIT ----
async function init() {
    try {
        await loadAppConfig();
    } catch (_) {
        showToast('App configuration failed to load. Refresh and try again.', 'error');
        return;
    }

    updateScheduleRequirements();
    setupEventListeners();
    setupBottomNav();
    setupOfflineDetection();
    registerServiceWorker();
    checkSession();
}

// ---- BOTTOM NAV ----
function setupBottomNav() {
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) navigate(page);
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(10);
        });
    });
}

// ---- SKELETON LOADING ----
function showSkeletonCards(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton">
            <div class="skeleton-line wide"></div>
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line fee"></div>
        </div>`;
    }
    container.innerHTML = html;
}

// ---- CONFETTI CELEBRATION ----
function burstConfetti() {
    const burst = document.createElement('div');
    burst.className = 'confetti-burst';
    const colors = ['#f2a154', '#e84545', '#2ecc71', '#a87bff', '#ffc87a', '#ff6b6b'];
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'confetti-particle';
        const angle = (Math.PI * 2 * i) / 30;
        const distance = 80 + Math.random() * 120;
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--ty', `${Math.sin(angle) * distance - 40}px`);
        particle.style.animationDelay = `${Math.random() * 0.15}s`;
        burst.appendChild(particle);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1500);
}

// ---- ORDER STATUS TIMELINE ----
function renderStatusTimeline(status) {
    const steps = ['open', 'accepted', 'picked_up', 'delivered'];
    const labels = ['Placed', 'Accepted', 'Picked Up', 'Delivered'];
    const icons = ['\u{1F4E6}', '\u2705', '\u{1F6F5}', '\u{1F389}'];
    const currentIdx = steps.indexOf(status);
    const isCancelled = status === 'cancelled';

    if (isCancelled) {
        return `<div class="status-timeline">
            <div class="timeline-progress" style="width:100%"></div>
            <div class="timeline-step active">
                <div class="timeline-dot" style="border-color:var(--coral);background:var(--coral)">\u2716</div>
                <span class="timeline-label" style="color:var(--coral)">Cancelled</span>
            </div>
        </div>`;
    }

    const progressPercent = currentIdx >= 0 ? (currentIdx / (steps.length - 1)) * 100 : 0;

    return `<div class="status-timeline">
        <div class="timeline-progress" style="width:${progressPercent}%"></div>
        ${steps.map((step, i) => {
            let cls = '';
            if (i < currentIdx) cls = 'completed';
            else if (i === currentIdx) cls = 'active';
            return `<div class="timeline-step ${cls}">
                <div class="timeline-dot">${i <= currentIdx ? icons[i] : ''}</div>
                <span class="timeline-label">${labels[i]}</span>
            </div>`;
        }).join('')}
    </div>`;
}

// ---- OFFLINE DETECTION ----
function setupOfflineDetection() {
    const banner = document.getElementById('offlineBanner');
    if (!banner) return;

    function updateOnlineStatus() {
        if (!navigator.onLine) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

// ---- SERVICE WORKER ----
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

init();
