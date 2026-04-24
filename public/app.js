/* ============================================
   PARSELFEE - Frontend Application
   All data from API, no localStorage
   ============================================ */

let currentUser = null;
let currentPage = 'auth';
let currentFilter = 'all';
let currentOrderTab = 'placed';
let trackingWatchId = null;
let trackingOrderId = null;
let trackingMap = null;
let trackingMarker = null;

// ---- API HELPER ----
async function api(path, options = {}) {
    const res = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

// ---- AUTH ----
function showLogin(e) {
    if (e) e.preventDefault();
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
    clearAuthErrors();
}

function showSignup(e) {
    if (e) e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
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
        errorEl.textContent = 'Only @rknec.in and @rbunagpur.in emails allowed.';
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
        errorEl.textContent = 'Only @rknec.in and @rbunagpur.in emails allowed.';
        return;
    }

    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
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
    return domain === 'rknec.in' || domain === 'rbunagpur.in';
}

function onAuthSuccess() {
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('navUser').textContent = currentUser.name;
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
        target.style.animation = 'none';
        target.offsetHeight;
        target.style.animation = '';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    document.getElementById('mobileMenu').classList.remove('open');

    if (page === 'browse') renderBrowseOrders();
    if (page === 'my-orders') renderMyOrders();
    if (page === 'profile') loadProfile();
    if (page === 'home') updateHomeStats();

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
    scheduleGroup.style.display = urgencySelect.value === 'scheduled' ? 'block' : 'none';
});

feeInput.addEventListener('input', () => {
    feePreview.textContent = feeInput.value || '0';
});

function setFee(amount) {
    feeInput.value = amount;
    feePreview.textContent = amount;
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
            delivery_fee: parseInt(feeInput.value) || 20,
            urgency: urgencySelect.value,
            schedule_time: document.getElementById('scheduleTime').value,
            notes: document.getElementById('orderNotes').value.trim()
        };

        const data = await api('/orders', { method: 'POST', body });
        showToast('Order posted! ' + data.order.order_code, 'success');
        document.getElementById('orderForm').reset();
        feeInput.value = 20;
        feePreview.textContent = '20';
        scheduleGroup.style.display = 'none';
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

async function renderBrowseOrders() {
    const grid = document.getElementById('browseOrdersGrid');
    const empty = document.getElementById('browseEmpty');

    try {
        const params = new URLSearchParams({ status: 'open' });
        if (currentFilter !== 'all') params.set('pickup', currentFilter);

        const data = await api('/orders?' + params.toString());
        const orders = data.orders;

        if (orders.length === 0) {
            grid.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        grid.innerHTML = orders.map((order, i) => `
            <div class="order-card" style="animation-delay: ${i * 0.08}s" onclick="openOrderDetail(${order.id})">
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
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); acceptOrder(${order.id})">
                        Accept Delivery &rarr;
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '';
        empty.style.display = 'block';
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
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        list.innerHTML = orders.map(order => `
            <div class="order-list-item" onclick="openOrderDetail(${order.id})">
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
        empty.style.display = 'block';
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
                <button class="btn btn-primary btn-lg" onclick="acceptOrder(${order.id})">Accept & Deliver &rarr;</button>
            </div>`;
        } else if (order.status === 'open' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-danger" onclick="updateStatus(${order.id}, 'cancelled')">Cancel Order</button>
            </div>`;
        } else if (order.status === 'accepted' && isAccepter) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-primary" onclick="updateStatus(${order.id}, 'picked_up')">Mark Picked Up</button>
            </div>`;
        } else if (order.status === 'accepted' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-outline" onclick="openOrderDetail(${order.id})">Refresh Location</button>
            </div>
            <p class="text-secondary mt-2">Waiting for pickup by ${esc(order.accepter_name || 'deliverer')}...</p>`;
        } else if (order.status === 'picked_up' && isAccepter) {
            actionsHtml = `<div class="pin-entry-wrap">
                <label class="pin-entry-label" for="deliveryPinInput">Requester Delivery PIN</label>
                <input id="deliveryPinInput" class="form-input" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit PIN">
            </div>
            <div class="modal-actions">
                <button class="btn btn-success btn-lg" onclick="confirmDelivery(${order.id})">Confirm Delivered &#x2713;</button>
            </div>`;
        } else if (order.status === 'picked_up' && isPlacer) {
            actionsHtml = `<div class="modal-actions">
                <button class="btn btn-outline" onclick="openOrderDetail(${order.id})">Refresh Location</button>
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
                        <button class="btn btn-outline btn-sm" onclick="shareCurrentLocation(${order.id})">Share Now</button>
                        <button class="btn btn-outline btn-sm" onclick="startLiveTracking(${order.id})">Start Live</button>
                        <button class="btn btn-outline btn-sm" onclick="stopLiveTracking()">Stop Live</button>
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

            <div style="text-align:center;">
                <span class="text-dim" style="font-size:0.8rem;">Order ${esc(order.order_code)} &middot; ${new Date(order.created_at).toLocaleString()}</span>
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
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(trackingMap);

    trackingMarker = window.L.circleMarker([lat, lng], {
        radius: 8,
        color: '#f2a154',
        fillColor: '#f2a154',
        fillOpacity: 0.95,
        weight: 2
    }).addTo(trackingMap);

    trackingMap.setView([lat, lng], 16);
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
    const date = new Date(value + 'Z');
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
        timeout: 10000,
        maximumAge: 5000
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
        timeout: 10000,
        maximumAge: 5000
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

        if (newStatus === 'delivered') showToast('Delivered! Fee earned.', 'success');
        else if (newStatus === 'picked_up') showToast('Picked up! Head to delivery spot.', 'success');
        else if (newStatus === 'cancelled') showToast('Order cancelled.', 'error');

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

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr + 'Z').getTime();
    const diff = Math.floor((now - then) / 1000);
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

// ---- INIT ----
checkSession();
