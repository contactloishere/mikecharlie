/* ============================================================
   CHECKOUT PAGE LOGIC
   Depends on: shipping-rates.js (SHIPPING_RATES, getShippingRate),
   shared.js (SB_URL/SB_KEY already defined on the page, plus
   loadSession/saveSession/openAuthModal/closeAuthModal/setAuthMode).
   ============================================================ */

const $ = id => document.getElementById(id);

const PAYMENT_QR = {
  gcash:    { label: 'GCash',    img: 'https://static.wixstatic.com/media/d7782b_4f0c7227f5424c28b52a1b3e510258c6~mv2.png' },
  bdo:      { label: 'BDO',      img: 'https://static.wixstatic.com/media/d7782b_711c8ee305b64c8da7db6d4c9d8c1557~mv2.png' },
  gotyme:   { label: 'GoTyme',   img: 'https://static.wixstatic.com/media/d7782b_8c9282b35fb444328bb65bd83fc49439~mv2.png' },
  maribank: { label: 'Maribank', img: 'https://static.wixstatic.com/media/d7782b_759677dabeb04f238fe987a1728b7153~mv2.png' },
  cimb:     { label: 'CIMB Bank',img: 'https://static.wixstatic.com/media/d7782b_c0ffca6de8094dc59dd09ddd5bfb46f1~mv2.png' },
  maya:     { label: 'Maya',     img: 'https://static.wixstatic.com/media/d7782b_bb7d3bebd7c54560b66636054b97d87c~mv2.png' }
};

// Platforms that use a phone number vs. a text handle
const PHONE_PLATFORMS = ['imessage', 'whatsapp', 'viber'];
const HANDLE_PLATFORMS = ['threads', 'instagram'];

const GUEST_DETAILS_KEY = 'mcc_checkout_details';

const CO = {
  cart: JSON.parse(localStorage.getItem('mcc_cart') || '[]'),
  skus: [],
  session: null,       // logged-in session, if any
  profile: null,       // row from mcc_customers, if logged in
  subtotal: 0,
  shippingFee: null,
  proofUrl: null
};

async function sbGet(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) throw new Error('Load failed: ' + table);
  return r.json();
}

/* ─── INIT ─── */
async function initCheckout() {
  if (!CO.cart.length) {
    $('co-items').innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Your tote bag is empty. <a href="/" style="color:var(--lagoon);font-weight:600">Go back to shop</a></p>';
    $('submit-btn').disabled = true;
  }

  populateRegionDropdown();

  // Load cart product details
  if (CO.cart.length) {
    try {
      const ids = CO.cart.map(i => i.sku_id).join(',');
      const [skus, listings, variantPhotos] = await Promise.all([
        sbGet('skus', `id=in.(${ids})&select=*`),
        sbGet('product_listings', 'select=*'),
        sbGet('variant_photos', `sku_id=in.(${ids})&select=sku_id,photo_url`)
      ]);
      const listingByTitle = {}; listings.forEach(l => listingByTitle[l.title] = l);
      const photoBySku = {}; variantPhotos.forEach(p => { if (p.photo_url) photoBySku[p.sku_id] = p.photo_url; });
      skus.forEach(s => { s.listing = listingByTitle[s.product_name] || {}; s.coverPhoto = photoBySku[s.id] || s.listing.cover_image_url || null; });
      CO.skus = skus;
      renderItems();
    } catch (e) {
      $('co-items').innerHTML = '<p style="font-size:13px;color:var(--danger)">Could not load your items. Please refresh.</p>';
    }
  }

  // Session check — logged in vs guest
  CO.session = (typeof getFreshSession === 'function') ? await getFreshSession() : null;
  if (CO.session) {
    await loadCustomerProfile();
  } else {
    CO.session = null;
    prefillFromGuestStorage();
  }
  renderAcctBanner();
  recalcTotals();
}

function renderItems() {
  let subtotal = 0;
  $('co-items').innerHTML = CO.cart.map(item => {
    const sku = CO.skus.find(s => s.id === item.sku_id);
    if (!sku) return '';
    const price = (sku.is_on_sale && sku.sale_price != null) ? sku.sale_price : sku.retail_price_direct;
    const lineTotal = (price || 0) * item.qty;
    subtotal += lineTotal;
    return `<div class="co-item">
      <div class="co-item-img">${sku.coverPhoto ? `<img src="${sku.coverPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : '🌿'}</div>
      <div class="co-item-info">
        <div class="co-item-name">${sku.product_name}</div>
        ${sku.variant ? `<div class="co-item-var">${sku.variant}</div>` : ''}
        <div class="co-item-qty">Qty: ${item.qty}</div>
      </div>
      <div class="co-item-price">${P(lineTotal)}</div>
    </div>`;
  }).join('');
  CO.subtotal = subtotal;
}

function totalWeightKg() {
  let grams = 0;
  CO.cart.forEach(item => {
    const sku = CO.skus.find(s => s.id === item.sku_id);
    // Assumes a weight_g column on skus (grams per unit). Falls back to 0
    // if that column doesn't exist yet — flag this to Lois if totals look off.
    const w = sku && sku.weight_g != null ? Number(sku.weight_g) : 0;
    grams += w * item.qty;
  });
  return grams / 1000;
}

function populateRegionDropdown() {
  const sel = $('f-region');
  SHIPPING_RATES.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.label;
    sel.appendChild(opt);
  });
}

function recalcTotals() {
  $('bd-subtotal').textContent = P(CO.subtotal);
  const regionId = $('f-region').value;
  if (!regionId) { $('bd-shipping').textContent = '—'; $('bd-total').textContent = P(CO.subtotal); CO.shippingFee = null; return; }
  const fee = getShippingRate(regionId, totalWeightKg());
  if (fee == null) {
    $('bd-shipping').textContent = 'Contact us';
    $('bd-total').textContent = P(CO.subtotal);
    CO.shippingFee = null;
    return;
  }
  CO.shippingFee = fee;
  $('bd-shipping').textContent = P(fee);
  $('bd-total').textContent = P(CO.subtotal + fee);
}

/* ─── CONTACT NUMBER: digits only, 11 max ─── */
(function limitContactNumber() {
  const el = document.getElementById('f-contact');
  if (!el) return;
  el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 11); });
})();

/* ─── PLATFORM / HANDLE LOGIC ─── */
function onPlatformChange() {
  const platform = $('f-platform').value;
  const wrap = $('handle-field-wrap');
  const prefixEl = $('handle-prefix');
  const input = $('f-handle');
  input.value = '';
  if (!platform) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if (PHONE_PLATFORMS.includes(platform)) {
    $('handle-label').innerHTML = 'Phone number for updates <span class="req">*</span>';
    prefixEl.textContent = '+639';
    input.placeholder = '171234567';
    input.maxLength = 9;
    input.setAttribute('inputmode', 'numeric');
    input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 9); };
  } else {
    $('handle-label').innerHTML = 'Handle <span class="req">*</span>';
    prefixEl.textContent = '@';
    input.removeAttribute('maxlength');
    input.removeAttribute('inputmode');
    input.placeholder = 'yourhandle';
    // Letters, numbers, periods, underscores — matches real IG/Threads handle rules
    input.oninput = () => { input.value = input.value.replace(/[^a-zA-Z0-9._]/g, ''); };
  }
}

function getFullHandle() {
  const platform = $('f-platform').value;
  const raw = $('f-handle').value.trim();
  if (!platform || !raw) return '';
  return PHONE_PLATFORMS.includes(platform) ? ('+639' + raw) : ('@' + raw);
}

/* ─── PAYMENT ─── */
function onPaymentChange() {
  const method = $('f-payment').value;
  const box = $('qr-box');
  if (!method || !PAYMENT_QR[method]) { box.classList.remove('show'); return; }
  $('qr-img').src = PAYMENT_QR[method].img;
  $('qr-img').alt = PAYMENT_QR[method].label + ' QR code';
  box.classList.add('show');
}

let proofFile = null;
function onProofSelected() {
  const input = $('f-proof');
  proofFile = input.files[0] || null;
  const box = $('upload-box');
  if (proofFile) { box.classList.add('has-file'); $('upload-label').textContent = '✓ ' + proofFile.name; }
  else { box.classList.remove('has-file'); $('upload-label').textContent = 'Tap to upload a screenshot or photo of your payment'; }
}

async function uploadProof() {
  const path = `proof/${Date.now()}_${proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/proof-of-payment/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': proofFile.type },
    body: proofFile
  });
  if (!r.ok) throw new Error('Proof upload failed. Please try again.');
  return `${SB_URL}/storage/v1/object/public/proof-of-payment/${path}`;
}

/* ─── GUEST DETAIL PERSISTENCE ─── */
function prefillFromGuestStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_DETAILS_KEY) || 'null');
    if (!saved) return;
    $('f-name').value = saved.full_name || '';
    $('f-address').value = saved.address || '';
    $('f-contact').value = (saved.contact_number || '').replace(/\D/g, '').slice(0, 11);
    if (saved.platform) { $('f-platform').value = saved.platform; onPlatformChange(); $('f-handle').value = (saved.handle || '').replace(/^(\+639|@)/, ''); }
    if (saved.region_id) $('f-region').value = saved.region_id;
  } catch (e) {}
}
function saveGuestDetails() {
  localStorage.setItem(GUEST_DETAILS_KEY, JSON.stringify({
    full_name: $('f-name').value.trim(),
    address: $('f-address').value.trim(),
    contact_number: $('f-contact').value.trim(),
    platform: $('f-platform').value,
    handle: getFullHandle(),
    region_id: $('f-region').value
  }));
}

/* ─── LOGGED-IN CUSTOMER PROFILE ─── */
async function loadCustomerProfile() {
  try {
    const rows = await fetch(`${SB_URL}/rest/v1/mcc_customers?id=eq.${CO.session.user.id}&select=*`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + CO.session.access_token }
    }).then(r => r.json());
    CO.profile = rows[0] || null;
    if (CO.profile) {
      $('f-name').value = CO.profile.full_name || '';
      $('f-address').value = CO.profile.address || '';
      $('f-contact').value = (CO.profile.contact_number || '').replace(/\D/g, '').slice(0, 11);
      if (CO.profile.contact_platform) {
        $('f-platform').value = CO.profile.contact_platform;
        onPlatformChange();
        $('f-handle').value = (CO.profile.contact_handle || '').replace(/^(\+639|@)/, '');
      }
    }
  } catch (e) { /* not fatal — form just starts blank */ }
}

function renderAcctBanner() {
  // The create-account-vs-guest choice already happened in the cart, so
  // this only needs to confirm the outcome — no prompt to repeat here.
  const el = $('acct-banner');
  if (CO.session) {
    el.className = 'acct-banner signed-in';
    el.innerHTML = `<p>Checking out as <strong>${CO.session.user.email}</strong>. This order will be saved to your account.</p><button type="button" onclick="doLogout()">Not you? Log out</button>`;
  } else {
    el.style.display = 'none';
  }
}

/* ─── VALIDATION ─── */
function validateForm() {
  const name = $('f-name').value.trim();
  const address = $('f-address').value.trim();
  const contact = $('f-contact').value.trim();
  const platform = $('f-platform').value;
  const handle = $('f-handle').value.trim();
  const region = $('f-region').value;
  const payment = $('f-payment').value;

  if (!CO.cart.length) return 'Your tote bag is empty.';
  if (!name || !address || !contact || !platform || !handle || !region) return 'Please fill out all fields marked with an asterisk (*).';
  if (!/^\d{11}$/.test(contact)) return 'Contact number must be exactly 11 digits, for example 09171234567.';
  if (PHONE_PLATFORMS.includes(platform) && !/^\d{9}$/.test(handle)) return 'Please enter the 9 digits that come after +639 for your phone number for updates.';
  if (!payment) return 'Please select a mode of payment.';
  if (!proofFile) return 'Please upload proof of payment.';
  if (CO.shippingFee == null) return 'We couldn\'t calculate shipping for that region/weight — please contact us directly for a manual quote.';
  return null;
}

/* ─── PROCESSING ANIMATION ─── */
(function addProcessingStyles() {
  const css = `
    @keyframes mccSpin { to { transform: rotate(360deg); } }
    .mcc-spin { display:inline-block; width:16px; height:16px; margin-right:8px; vertical-align:-3px;
      border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation: mccSpin .8s linear infinite; }
    #mcc-processing { display:none; margin-top:14px; padding:14px 16px; border-radius:10px; text-align:center;
      background:#F0E8DA; border:1px solid #E6D5C3; color:#2C4542; font-size:13px; line-height:1.5; }
    #mcc-processing .mcc-spin-big { display:block; width:34px; height:34px; margin:0 auto 10px;
      border:3.5px solid #E6D5C3; border-top-color:#3E5F5C; border-radius:50%; animation: mccSpin .9s linear infinite; }
    #mcc-processing strong { display:block; font-size:14px; margin-bottom:2px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

function warnBeforeLeaving(e) { e.preventDefault(); e.returnValue = ''; }

function showProcessing() {
  let box = $('mcc-processing');
  if (!box) {
    box = document.createElement('div');
    box.id = 'mcc-processing';
    box.innerHTML = '<span class="mcc-spin-big"></span><strong>Do not close this window.</strong>We are processing your order. This can take a few seconds.';
    $('submit-btn').insertAdjacentElement('afterend', box);
  }
  box.style.display = 'block';
  window.addEventListener('beforeunload', warnBeforeLeaving);
}

function hideProcessing() {
  const box = $('mcc-processing');
  if (box) box.style.display = 'none';
  window.removeEventListener('beforeunload', warnBeforeLeaving);
}

/* ─── SUBMIT ─── */
async function submitOrder() {
  // Re-check login status right before submitting — catches a customer
  // who logs in via the header link mid-form, after the page first loaded.
  CO.session = (typeof getFreshSession === 'function') ? await getFreshSession() : null;

  const err = validateForm();
  const errBox = $('form-err');
  if (err) { errBox.textContent = err; errBox.style.display = 'block'; window.scrollTo(0, 0); return; }
  errBox.style.display = 'none';

  const btn = $('submit-btn'); const orig = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="mcc-spin"></span>Submitting...';
  showProcessing();

  try {
    CO.proofUrl = await uploadProof();

    const orderPayload = {
      id: crypto.randomUUID(),
      customer_id: CO.session ? CO.session.user.id : null,
      customer_name: $('f-name').value.trim(),
      address: $('f-address').value.trim(),
      contact_number: $('f-contact').value.trim(),
      contact_platform: $('f-platform').value,
      contact_handle: getFullHandle(),
      region_id: $('f-region').value,
      region_label: SHIPPING_RATES.find(r => r.id === $('f-region').value)?.label || '',
      total_weight_kg: totalWeightKg(),
      subtotal: CO.subtotal,
      shipping_fee: CO.shippingFee,
      total: CO.subtotal + CO.shippingFee,
      payment_method: $('f-payment').value,
      proof_url: CO.proofUrl,
      notes: $('f-note').value.trim() || null
    };

    // Make sure this member has a customer record BEFORE saving the order.
    // (New members, such as Google sign-ups, do not have one yet.)
    if (CO.session) {
      const custRes = await fetch(`${SB_URL}/rest/v1/mcc_customers`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + CO.session.access_token,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          id: CO.session.user.id,
          full_name: orderPayload.customer_name,
          address: orderPayload.address,
          contact_number: orderPayload.contact_number,
          contact_platform: orderPayload.contact_platform,
          contact_handle: orderPayload.contact_handle
        })
      });
      if (!custRes.ok) {
        const detail = await custRes.text();
        console.error('Customer record failed:', custRes.status, detail);
        throw new Error('Could not set up your member profile. Please try again. (Details for Lois: ' + custRes.status + ' ' + detail.slice(0, 200) + ')');
      }
    }

    const orderRes = await fetch(`${SB_URL}/rest/v1/mcc_orders`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + (CO.session ? CO.session.access_token : SB_KEY),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(orderPayload)
    });
    if (!orderRes.ok) {
      const detail = await orderRes.text();
      console.error('Order save failed:', orderRes.status, detail);
      throw new Error('Could not submit your order. Please try again. (Details for Lois: ' + orderRes.status + ' ' + detail.slice(0, 200) + ')');
    }
    const order = { id: orderPayload.id };

    const items = CO.cart.map(item => {
      const sku = CO.skus.find(s => s.id === item.sku_id);
      const price = (sku.is_on_sale && sku.sale_price != null) ? sku.sale_price : sku.retail_price_direct;
      return {
        order_id: order.id,
        sku_id: sku.id,
        product_name: sku.product_name,
        variant: sku.variant || null,
        cover_image_url: sku.coverPhoto || null,
        unit_price: price,
        qty: item.qty,
        line_total: price * item.qty
      };
    });
    const itemsRes = await fetch(`${SB_URL}/rest/v1/mcc_order_items`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (CO.session ? CO.session.access_token : SB_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    });
    if (!itemsRes.ok) throw new Error('Order saved, but there was an issue recording your items — please contact us with your order confirmation.');

    // Persist details for next time
    if (CO.session) {
      await fetch(`${SB_URL}/rest/v1/mcc_customers?id=eq.${CO.session.user.id}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + CO.session.access_token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          full_name: orderPayload.customer_name, address: orderPayload.address,
          contact_number: orderPayload.contact_number, contact_platform: orderPayload.contact_platform,
          contact_handle: orderPayload.contact_handle
        })
      });
    } else {
      saveGuestDetails();
      sessionStorage.setItem('mcc_signup_prefill', JSON.stringify(orderPayload));
    }

    localStorage.setItem('mcc_cart', '[]');
    showConfirmation();
  } catch (e) {
    errBox.textContent = e.message; errBox.style.display = 'block'; window.scrollTo(0, 0);
  } finally {
    hideProcessing();
    btn.disabled = false; btn.textContent = orig;
  }
}

function showConfirmation() {
  $('checkout-view').style.display = 'none';
  $('acct-banner').style.display = 'none';
  $('confirm-view').style.display = 'block';
  if (!CO.session) $('signup-prompt').style.display = 'block';
  else if (!$('view-order-btn')) {
    $('confirm-view').insertAdjacentHTML('beforeend',
      '<a id="view-order-btn" class="btn btn-p" href="/account.html#orders" style="display:block;max-width:320px;margin:0 auto;text-decoration:none">View my order</a>');
  }
}

function openSignupFromConfirm() {
  openAuthModal();
  setAuthMode('signup');
}

/* After a successful sign-up on this page, use the just-placed guest
   order's details to pre-fill the new customer profile (does NOT
   retroactively attach that guest order to the new account — see notes). */
const _originalSubmitAuth = window.submitAuth;
window.submitAuth = async function () {
  const wasSignup = (typeof authMode !== 'undefined' && authMode === 'signup');
  await _originalSubmitAuth();
  const session = (typeof loadSession === 'function') ? loadSession() : null;
  if (wasSignup && session) {
    const prefill = JSON.parse(sessionStorage.getItem('mcc_signup_prefill') || 'null');
    if (prefill) {
      await fetch(`${SB_URL}/rest/v1/mcc_customers`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: session.user.id, full_name: prefill.customer_name, address: prefill.address,
          contact_number: prefill.contact_number, contact_platform: prefill.contact_platform,
          contact_handle: prefill.contact_handle
        })
      });
    }
  }
};

initCheckout();
