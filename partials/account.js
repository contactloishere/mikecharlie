/* ============================================================
   MEMBER DASHBOARD LOGIC
   Depends on shared.js (SB_URL/SB_KEY on the page, loadSession,
   openAuthModal/closeAuthModal/setAuthMode/submitAuth).
   ============================================================ */

const $ = id => document.getElementById(id);

const STAGES = ['order_placed', 'awaiting_payment_verification', 'payment_confirmed', 'preparing_order', 'shipped'];
const STAGE_LABELS = {
  order_placed: 'You placed an order',
  awaiting_payment_verification: 'Waiting for payment verification',
  payment_confirmed: 'Payment confirmed',
  preparing_order: 'Preparing your order',
  shipped: 'Order picked up by courier'
};

const CONTACT_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/mikecharlieco/' },
  { key: 'threads', label: 'Threads', url: 'https://www.threads.com/mikecharlieco/' },
  { key: 'whatsapp', label: 'WhatsApp', url: 'https://wa.me/message/T7LXVS3L74A5C1' },
  { key: 'viber', label: 'Viber', url: 'viber://add?number=639760467782' },
  { key: 'imessage', label: 'iMessage', url: 'sms:+639760467782' },
  { key: 'messenger', label: 'Messenger', url: 'https://m.me/mikecharlieco' }
];

const PHONE_PLATFORMS = ['imessage', 'whatsapp', 'viber'];

let ACC = { session: null, profile: null, likes: [], orders: [], orderItemsByOrder: {} };

async function initAccount() {
  ACC.session = (typeof getFreshSession === 'function') ? await getFreshSession() : null;
  if (!ACC.session) {
    $('gate').style.display = 'block';
    $('dashboard').style.display = 'none';
    return;
  }
  $('gate').style.display = 'none';
  $('dashboard').style.display = 'block';
  if (typeof renderHeaderAuth === 'function') renderHeaderAuth();

  renderPlatformLinks();
  await Promise.all([loadProfile(), loadLikes(), loadOrders()]);

  // Links like /account.html#orders open straight on that tab
  const wanted = window.location.hash.replace('#', '');
  if (wanted && document.getElementById('panel-' + wanted)) switchTab(wanted);
}

// Contact number: digits only, 11 max
(function limitProfileContact() {
  const el = document.getElementById('p-contact');
  if (!el) return;
  el.maxLength = 11;
  el.setAttribute('inputmode', 'numeric');
  el.placeholder = '09XXXXXXXXX';
  el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 11); });
})();

function sbHeaders() {
  return { apikey: SB_KEY, Authorization: 'Bearer ' + ACC.session.access_token, 'Content-Type': 'application/json' };
}

/* ─── TABS ─── */
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('on', p.id === 'panel-' + name));
}

/* ─── PROFILE ─── */
async function loadProfile() {
  const rows = await fetch(`${SB_URL}/rest/v1/mcc_customers?id=eq.${ACC.session.user.id}&select=*`, { headers: sbHeaders() }).then(r => r.json());
  ACC.profile = rows[0] || null;
  if (ACC.profile) {
    $('p-name').value = ACC.profile.full_name || '';
    $('p-address').value = ACC.profile.address || '';
    $('p-contact').value = (ACC.profile.contact_number || '').replace(/\D/g, '').slice(0, 11);
    if (ACC.profile.contact_platform) {
      $('p-platform').value = ACC.profile.contact_platform;
      onProfilePlatformChange();
      $('p-handle').value = (ACC.profile.contact_handle || '').replace(/^(\+639|@)/, '');
    }
  } else {
    // Brand new member (for example, signed up with Google): pre-fill their name
    const meta = (ACC.session.user && ACC.session.user.user_metadata) || {};
    if (meta.full_name) $('p-name').value = meta.full_name;
  }
}

function onProfilePlatformChange() {
  const platform = $('p-platform').value;
  const wrap = $('p-handle-wrap');
  const prefixEl = $('p-handle-prefix');
  const input = $('p-handle');
  if (!platform) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if (PHONE_PLATFORMS.includes(platform)) {
    $('p-handle-label').innerHTML = 'Phone number for updates <span class="req">*</span>';
    prefixEl.textContent = '+639';
    input.maxLength = 9;
    input.setAttribute('inputmode', 'numeric');
    input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 9); };
  } else {
    $('p-handle-label').innerHTML = 'Handle <span class="req">*</span>';
    prefixEl.textContent = '@';
    input.removeAttribute('maxlength');
    input.removeAttribute('inputmode');
    input.oninput = () => { input.value = input.value.replace(/[^a-zA-Z0-9._]/g, ''); };
  }
}

async function saveProfile() {
  const msg = $('save-msg');
  const showMsg = (text, ok) => {
    msg.textContent = text;
    msg.style.color = ok ? 'var(--success)' : 'var(--danger)';
    msg.style.display = 'inline';
    clearTimeout(msg._t);
    msg._t = setTimeout(() => msg.style.display = 'none', ok ? 2500 : 5000);
  };

  const name = $('p-name').value.trim();
  const address = $('p-address').value.trim();
  const contact = $('p-contact').value.trim();
  const platform = $('p-platform').value;
  const rawHandle = $('p-handle').value.trim();

  if (!name || !address || !contact || !platform || !rawHandle) return showMsg('Please fill out all fields marked with *.', false);
  if (!/^\d{11}$/.test(contact)) return showMsg('Contact number must be exactly 11 digits.', false);
  if (PHONE_PLATFORMS.includes(platform) && !/^\d{9}$/.test(rawHandle)) return showMsg('Enter the 9 digits that come after +639.', false);

  const handle = PHONE_PLATFORMS.includes(platform) ? '+639' + rawHandle : '@' + rawHandle;
  const payload = {
    id: ACC.session.user.id,
    full_name: name,
    address: address,
    contact_number: contact,
    contact_platform: platform,
    contact_handle: handle
  };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_customers`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });
    if (r.ok) {
      localStorage.setItem('mcc_display_name', name);
      if (typeof renderHeaderAuth === 'function') renderHeaderAuth();
      showMsg('Saved \u2713', true);
    } else showMsg('Could not save. Please try again.', false);
  } catch (e) { showMsg('Could not save. Please check your connection.', false); }
}

/* ─── LIKES ─── */
async function loadLikes() {
  const likeRows = await fetch(`${SB_URL}/rest/v1/mcc_likes?customer_id=eq.${ACC.session.user.id}&select=sku_id`, { headers: sbHeaders() }).then(r => r.json());
  if (!likeRows.length) { $('likes-grid').innerHTML = '<div class="empty-note">Nothing hearted yet — browse the shop and tap the heart on anything you love.</div>'; return; }
  const ids = likeRows.map(l => l.sku_id).join(',');
  const skus = await fetch(`${SB_URL}/rest/v1/skus?id=in.(${ids})&select=*`, { headers: sbHeaders() }).then(r => r.json());
  const listings = await fetch(`${SB_URL}/rest/v1/product_listings?select=*`, { headers: sbHeaders() }).then(r => r.json());
  const listingByTitle = {}; listings.forEach(l => listingByTitle[l.title] = l);

  $('likes-grid').innerHTML = skus.map(sku => {
    const price = (sku.is_on_sale && sku.sale_price != null) ? sku.sale_price : sku.retail_price_direct;
    const img = sku.listing_cover || (listingByTitle[sku.product_name] || {}).cover_image_url;
    return `<div class="like-card">
      <button class="unheart-btn" onclick="unheart('${sku.id}')" title="Remove">♥</button>
      ${img ? `<img class="like-img" src="${img}">` : `<div class="like-img"></div>`}
      <div class="like-info">
        <div class="like-name">${sku.product_name}</div>
        <div class="like-price">${P(price)}</div>
      </div>
    </div>`;
  }).join('');
}

async function unheart(skuId) {
  await fetch(`${SB_URL}/rest/v1/mcc_likes?customer_id=eq.${ACC.session.user.id}&sku_id=eq.${skuId}`, { method: 'DELETE', headers: sbHeaders() });
  loadLikes();
}

/* ─── ORDERS ─── */
async function loadOrders() {
  const orders = await fetch(`${SB_URL}/rest/v1/mcc_orders?customer_id=eq.${ACC.session.user.id}&select=*&order=created_at.desc`, { headers: sbHeaders() }).then(r => r.json());
  ACC.orders = orders;
  if (!orders.length) { $('orders-list').innerHTML = '<div class="empty-note">No orders yet.</div>'; return; }
  const orderIds = orders.map(o => o.id).join(',');
  const items = await fetch(`${SB_URL}/rest/v1/mcc_order_items?order_id=in.(${orderIds})&select=*`, { headers: sbHeaders() }).then(r => r.json());
  ACC.orderItemsByOrder = {};
  items.forEach(it => { (ACC.orderItemsByOrder[it.order_id] ||= []).push(it); });
  switchOrderTab('current');
}

function switchOrderTab(which) {
  ACC.orderTab = which;
  const tabs = document.querySelector('.order-tabs');
  if (tabs) tabs.style.display = 'flex';
  document.querySelectorAll('.order-tab').forEach(b => b.classList.toggle('on', b.dataset.ot === which));
  const isPast = o => o.current_stage === 'shipped' || o.is_cancelled;
  const filtered = ACC.orders.filter(o => which === 'current' ? !isPast(o) : isPast(o));
  if (!filtered.length) {
    $('orders-list').innerHTML = `<div class="empty-note">No ${which} orders.</div>`;
    return;
  }
  $('orders-list').innerHTML = filtered.map(renderOrderSummary).join('');
}

/* ─── small helpers for the order screens ─── */
const PAYMENT_LABELS = { gcash: 'GCash', bdo: 'BDO', gotyme: 'GoTyme', maribank: 'Maribank', cimb: 'CIMB Bank', maya: 'Maya' };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function currentStatusLabel(order) {
  if (order.is_cancelled) return 'Cancelled';
  if (order.current_stage === 'shipped' && order.courier) return `Order picked up by ${order.courier === 'spx' ? 'SPX' : 'J&T'}`;
  return STAGE_LABELS[order.current_stage] || 'Order placed';
}
function thumbHtml(item, cls) {
  // Small picture of the product. If the picture is missing or fails to load, an empty soft box shows instead.
  if (!item.cover_image_url) return `<div class="${cls}"></div>`;
  return `<img class="${cls}" src="${esc(item.cover_image_url)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
}

/* ─── ORDER LIST CARD (short version, tap to open) ─── */
function renderOrderSummary(order) {
  const items = ACC.orderItemsByOrder[order.id] || [];
  const thumbs = items.slice(0, 4).map(it => thumbHtml(it, 'thumb')).join('');
  const more = items.length > 4 ? `<span class="thumb-more">+${items.length - 4}</span>` : '';
  const count = items.reduce((s, i) => s + (i.qty || 0), 0);
  const idx = STAGES.indexOf(order.current_stage);
  const pill = idx >= 4 ? 'pill-ship' : idx >= 2 ? 'pill-ok' : 'pill-wait';
  return `<div class="order-card clickable" onclick="openOrderDetail('${order.id}')">
    <div class="order-hdr">
      <span class="order-id">Order #${order.id.slice(0, 8)} &middot; ${fmtDate(order.created_at)}</span>
      <span class="status-pill ${pill}"${order.is_cancelled ? ' style="background:#E6D5C3;color:#4A6862"' : ''}>${esc(currentStatusLabel(order))}</span>
    </div>
    <div class="order-thumbs">${thumbs}${more}</div>
    <div class="order-sum-row">
      <span class="order-items-mini">${count} item${count === 1 ? '' : 's'}</span>
      <span class="order-total">${P(order.total)}</span>
    </div>
    <div class="view-link">View order details &rsaquo;</div>
  </div>`;
}

/* ─── ORDER DETAIL PAGE ─── */
function openOrderDetail(orderId) {
  const order = ACC.orders.find(o => o.id === orderId);
  if (!order) return;
  const tabs = document.querySelector('.order-tabs');
  if (tabs) tabs.style.display = 'none';
  $('orders-list').innerHTML = renderOrderDetail(order);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeOrderDetail() {
  switchOrderTab(ACC.orderTab || 'current');
}

function buildStageRows(order) {
  const currentIdx = STAGES.indexOf(order.current_stage);
  // Customers only see steps that have happened so far. Future steps stay hidden.
  return STAGES.map((key, i) => {
    if (i > currentIdx) return '';
    const date = order.stage_dates && order.stage_dates[key];
    let label = STAGE_LABELS[key];
    if (key === 'shipped' && order.courier) label = `Order picked up by ${order.courier === 'spx' ? 'SPX' : 'J&T'}`;
    return `<div class="stage-row">
      <div class="stage-dot done">&#10003;</div>
      <div class="stage-text">
        <div class="stage-label">${label}</div>
        ${date ? `<div class="stage-date">${fmtDate(date)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}
function buildTrackingHtml(order) {
  if (order.current_stage !== 'shipped' || !order.tracking) return '';
  if (order.tracking.type === 'spx' && order.tracking.link) {
    return `<div class="tracking-box">Your package is on its way. <a href="${esc(order.tracking.link)}" target="_blank" rel="noopener">Track your SPX package &rarr;</a></div>`;
  }
  if (order.tracking.type === 'jnt' && order.tracking.number) {
    return `<div class="tracking-box">
      Enter this tracking number at <a href="https://www.jtexpress.ph/track-and-trace" target="_blank" rel="noopener">jtexpress.ph/track-and-trace</a>:
      <div class="tracking-num">${esc(order.tracking.number)}</div>
    </div>`;
  }
  return '';
}

function renderOrderDetail(order) {
  const items = ACC.orderItemsByOrder[order.id] || [];
  const currentIdx = STAGES.indexOf(order.current_stage);
  const pct = Math.round((currentIdx / (STAGES.length - 1)) * 100);
  const platformLabel = (CONTACT_PLATFORMS.find(p => p.key === order.contact_platform) || {}).label || order.contact_platform || '';
  const payLabel = PAYMENT_LABELS[order.payment_method] || order.payment_method || '';
  const payStatus = order.is_cancelled ? 'Cancelled' : currentIdx >= 2 ? 'Payment confirmed' : 'Waiting for payment verification';

  const itemRows = items.map(it => `<div class="detail-item">
      ${thumbHtml(it, 'detail-thumb')}
      <div class="detail-item-info">
        <div class="detail-item-name">${esc(it.product_name)}</div>
        ${it.variant ? `<div class="detail-item-var">${esc(it.variant)}</div>` : ''}
        <div class="detail-item-var">${P(it.unit_price)} &times; ${it.qty}</div>
      </div>
      <div class="detail-item-price">${P(it.line_total)}</div>
    </div>`).join('');

  return `<button class="back-btn" onclick="closeOrderDetail()">&larr; All orders</button>

    <div class="order-card">
      <div class="order-hdr">
        <span class="order-id">Order #${order.id.slice(0, 8)}</span>
        <span class="order-id">Placed ${fmtDate(order.created_at)}</span>
      </div>
      ${order.is_cancelled
        ? `<div class="empty-note" style="padding:1rem 0">This order was cancelled${order.cancelled_at ? ' on ' + fmtDate(order.cancelled_at) : ''}. If you have questions, please message us from the Message tab.</div>`
        : `<div class="progress-track">
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-pct">${pct}%</div>
      </div>
      <div class="stage-list">${buildStageRows(order)}</div>
      ${buildTrackingHtml(order)}`}
    </div>

    <div class="card">
      <h2>Items Ordered</h2>
      ${itemRows || '<div class="empty-note">No items found.</div>'}
      <div class="detail-line"><span>Subtotal</span><span>${P(order.subtotal)}</span></div>
      <div class="detail-line"><span>Shipping fee</span><span>${P(order.shipping_fee)}</span></div>
      <div class="detail-line total"><span>Total</span><span>${P(order.total)}</span></div>
    </div>

    <div class="card">
      <h2>Delivery Information</h2>
      <div class="detail-block"><div class="detail-k">Name</div><div>${esc(order.customer_name)}</div></div>
      <div class="detail-block"><div class="detail-k">Address</div><div style="white-space:pre-line">${esc(order.address)}</div></div>
      ${order.region_label ? `<div class="detail-block"><div class="detail-k">Shipping region</div><div>${esc(order.region_label)}</div></div>` : ''}
      <div class="detail-block"><div class="detail-k">Contact number</div><div>${esc(order.contact_number)}</div></div>
      <div class="detail-block"><div class="detail-k">Updates via</div><div>${esc(platformLabel)} ${esc(order.contact_handle || '')}</div></div>
      ${order.notes ? `<div class="detail-block"><div class="detail-k">Your note</div><div style="white-space:pre-line">${esc(order.notes)}</div></div>` : ''}
    </div>

    <div class="card">
      <h2>Payment</h2>
      <div class="detail-block"><div class="detail-k">Method</div><div>${esc(payLabel)}</div></div>
      <div class="detail-block"><div class="detail-k">Status</div><div>${payStatus}</div></div>
      ${order.proof_url ? `<div class="detail-block"><a href="${esc(order.proof_url)}" target="_blank" rel="noopener" style="color:var(--lagoon);font-weight:600;font-size:13px">View your proof of payment &rarr;</a></div>` : ''}
    </div>`;
}

/* ─── MESSAGE / CONTACT LINKS ─── */
function renderPlatformLinks() {
  $('platform-links').innerHTML = CONTACT_PLATFORMS.map(p =>
    `<a class="platform-link" href="${p.url}" target="_blank" rel="noopener"><span>${p.label}</span><span class="arrow">→</span></a>`
  ).join('');
}

initAccount();
