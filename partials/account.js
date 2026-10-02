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
  { key: 'viber', label: 'Viber', url: 'viber://chat?number=639760467782' },
  { key: 'imessage', label: 'iMessage', url: 'sms:+639760467782' }
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
  $('auth-link').textContent = 'Log Out';
  $('auth-link').onclick = doLogout;

  renderPlatformLinks();
  await Promise.all([loadProfile(), loadLikes(), loadOrders()]);
}

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
    $('p-contact').value = ACC.profile.contact_number || '';
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
    $('p-handle-label').textContent = 'Phone number for updates';
    prefixEl.textContent = '+639';
    input.oninput = () => { input.value = input.value.replace(/\D/g, ''); };
  } else {
    $('p-handle-label').textContent = 'Handle';
    prefixEl.textContent = '@';
    input.oninput = () => { input.value = input.value.replace(/[^a-zA-Z0-9._]/g, ''); };
  }
}

async function saveProfile() {
  const platform = $('p-platform').value;
  const rawHandle = $('p-handle').value.trim();
  const handle = platform ? (PHONE_PLATFORMS.includes(platform) ? '+639' + rawHandle : '@' + rawHandle) : null;

  const payload = {
    id: ACC.session.user.id,
    full_name: $('p-name').value.trim(),
    address: $('p-address').value.trim(),
    contact_number: $('p-contact').value.trim(),
    contact_platform: platform || null,
    contact_handle: handle
  };
  const r = await fetch(`${SB_URL}/rest/v1/mcc_customers`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(payload)
  });
  const msg = $('save-msg');
  if (r.ok) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2500); }
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
  document.querySelectorAll('.order-tab').forEach(b => b.classList.toggle('on', b.dataset.ot === which));
  const filtered = ACC.orders.filter(o => which === 'current' ? o.current_stage !== 'shipped' : o.current_stage === 'shipped');
  if (!filtered.length) {
    $('orders-list').innerHTML = `<div class="empty-note">No ${which} orders.</div>`;
    return;
  }
  $('orders-list').innerHTML = filtered.map(renderOrderCard).join('');
}

function renderOrderCard(order) {
  const items = ACC.orderItemsByOrder[order.id] || [];
  const itemsLine = items.map(i => `${i.product_name}${i.variant ? ' (' + i.variant + ')' : ''} ×${i.qty}`).join(', ');

  const currentIdx = STAGES.indexOf(order.current_stage); // 1..4
  const pct = Math.round((currentIdx / (STAGES.length - 1)) * 100);

  const stageRows = STAGES.map((key, i) => {
    const done = i <= currentIdx;
    const date = order.stage_dates && order.stage_dates[key];
    let label = STAGE_LABELS[key];
    if (key === 'shipped' && order.courier) label = `Order picked up by ${order.courier === 'spx' ? 'SPX' : 'J&T'}`;
    return `<div class="stage-row">
      <div class="stage-dot ${done ? 'done' : 'pending'}">${done ? '✓' : ''}</div>
      <div class="stage-text">
        <div class="stage-label ${done ? '' : 'pending-label'}">${label}</div>
        ${date ? `<div class="stage-date">${new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  let trackingHtml = '';
  if (order.current_stage === 'shipped' && order.tracking) {
    if (order.tracking.type === 'spx' && order.tracking.link) {
      trackingHtml = `<div class="tracking-box">Your package is on its way. <a href="${order.tracking.link}" target="_blank" rel="noopener">Track your SPX package →</a></div>`;
    } else if (order.tracking.type === 'jnt' && order.tracking.number) {
      trackingHtml = `<div class="tracking-box">
        Enter this tracking number at <a href="https://www.jtexpress.ph/track-and-trace" target="_blank" rel="noopener">jtexpress.ph/track-and-trace</a>:
        <div class="tracking-num">${order.tracking.number}</div>
      </div>`;
    }
  }

  return `<div class="order-card">
    <div class="order-hdr">
      <span class="order-id">Order #${order.id.slice(0, 8)}</span>
      <span class="order-total">${P(order.total)}</span>
    </div>
    <div class="order-items-mini">${itemsLine}</div>
    <div class="progress-track">
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-pct">${pct}%</div>
    </div>
    <div class="stage-list">${stageRows}</div>
    ${trackingHtml}
  </div>`;
}

/* ─── MESSAGE / CONTACT LINKS ─── */
function renderPlatformLinks() {
  $('platform-links').innerHTML = CONTACT_PLATFORMS.map(p =>
    `<a class="platform-link" href="${p.url}" target="_blank" rel="noopener"><span>${p.label}</span><span class="arrow">→</span></a>`
  ).join('');
}

initAccount();
