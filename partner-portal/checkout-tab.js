/* ============================================================
   PARTNER PORTAL: CHECKOUT (opened from the cart bar or the cart icon)
   One page: order summary, delivery address (with a Save address button, 5 max), courier, instructions,
   payment (QR codes and screenshot upload), data privacy note, Submit order.
   Everything typed is saved on this device, so a refresh never loses it.
   With an empty cart it shows the partner's active orders instead.
   Shipping weight = product weight + the box and padding allowance (partnerPackingKg).
   The allowance is never shown to the partner. Prices are checked again by the database.
   ============================================================ */
const CK = { addresses: [], sel: 'new', courier: 'spx', notes: '', f: {}, busy: false, method: '', amount: '', amountEdited: false, file: null };
function ckKey() { return 'mcc_partner_ck_' + (PP.session ? PP.session.user.id : 'x') + (PP.viewAs ? '_view' : ''); }
function ckPersist() {
  try { localStorage.setItem(ckKey(), JSON.stringify({ sel: CK.sel, courier: CK.courier, notes: CK.notes, f: CK.f, method: CK.method, amount: CK.amount, amountEdited: CK.amountEdited })); } catch (e) {}
}
function ckRestore() {
  try {
    const d = JSON.parse(localStorage.getItem(ckKey()) || 'null'); if (!d) return false;
    if (d.sel && (d.sel === 'new' || CK.addresses.some(a => a.id === d.sel))) CK.sel = d.sel;
    if (d.courier) CK.courier = d.courier;
    CK.notes = d.notes || ''; CK.f = Object.assign(CK.f, d.f || {}); CK.method = d.method || '';
    CK.amount = d.amount || ''; CK.amountEdited = !!d.amountEdited;
    return true;
  } catch (e) { return false; }
}
function ckClearSaved() { try { localStorage.removeItem(ckKey()); } catch (e) {} }

function ppShowCheckout() { ppShowTab('checkout'); }

async function ppRenderCheckout(body) {
  if (!PP.draft || !PP.draft.length) { await ckRenderActiveOrders(body); return; }
  try {
    await ppLoadShop();
    CK.addresses = await ppRest('mcc_partner_addresses?select=*&order=created_at.asc');
  } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load checkout</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again. Your order is saved on this device.</p>
      <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('checkout')">Try again</button></div>`;
    return;
  }
  CK.sel = CK.addresses.length ? CK.addresses[0].id : 'new';
  CK.f = { label: '', name: PP.partner.contact_name || '', phone: PP.partner.contact_number || '', address: '', region: '' };
  CK.notes = ''; CK.busy = false; CK.method = ''; CK.amount = ''; CK.amountEdited = false; CK.file = null; CK.courier = 'spx';
  ckRestore(); ckFixCourier();
  body.innerHTML = `<button class="ck-x" style="font-size:13px;color:var(--lagoon);margin-bottom:6px" onclick="ppShowTab('order')">← Back to shop</button>
    <h2 class="sec-title" style="margin-top:0">${ppEsc(ppPoss(PP.partner.business_name))} Cart: Checkout</h2>
    <div class="ck-grid"><div>
      <div class="card"><h2>1. Order summary</h2><div id="ck-lines"></div></div>
      <div class="card"><h2>2. Shipping address</h2><div id="ck-addr"></div></div>
      <div class="card"><h2>3. Courier</h2><div id="ck-courier"></div></div>
      <div class="card"><h2>4. Instructions or message (optional)</h2>
        <textarea class="inp" id="ck-notes" rows="3" placeholder="Custom wrapping, branding, label design, delivery notes, anything we should know" oninput="CK.notes=this.value;ckPersist()">${ppEsc(CK.notes)}</textarea></div>
      <div class="card"><h2>5. Payment</h2><div id="ck-pay"></div></div>
    </div><div>
      <div class="card" style="position:sticky;top:150px"><h2>Order total</h2><div id="ck-totals"></div>
        <div id="ck-err" class="auth-err" style="margin-top:12px"></div>
        <button class="btn btn-p" id="ck-place" style="margin-top:12px" onclick="ckPlace()">Submit order</button>
        <p class="muted" style="font-size:12px;line-height:1.55;margin-top:10px;text-align:center">We check your order and payment, then start preparing it. If anything is missing, like a label design fee, we add it to your invoice and you can send the extra payment later.</p>
        <p class="privacy-note">In compliance with RA 10173 (Data Privacy Act), your delivery details will strictly be used for order fulfillment and shipping purposes only.</p></div>
    </div></div>`;
  ckRenderLines(); ckRenderAddr(); ckRenderCourier(); ckRenderTotals(); ckRenderPay();
}

/* With an empty cart: the partner's orders that are still open, so they can always get back to the details */
async function ckRenderActiveOrders(body) {
  try { await ppLoadPartnerData(false); }
  catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your orders</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again.</p>
      <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('checkout')">Try again</button></div>`;
    return;
  }
  const active = PAY.orders.filter(o => !o.is_cancelled && o.current_stage !== 'shipped' && o.current_stage !== 'delivered');
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">${ppEsc(ppPoss(PP.partner.business_name))} Cart</h2>` +
    `<div class="card center" style="margin-bottom:14px"><div style="font-size:30px">🛒</div><h2>Your cart is empty</h2>
      <p class="muted" style="font-size:13px;margin-bottom:12px">Add products or sets from the shop to start an order.</p>
      <button class="btn btn-p" style="max-width:240px;margin:0 auto" onclick="ppShowTab('order')">Go to the shop</button></div>` +
    (active.length ? `<h2 class="sec-title" style="font-size:1.25rem">Your orders in progress</h2>` + active.map(o => {
      const due = payBalance(o);
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><span class="badge" style="margin:0">${ppEsc(o.order_code)}</span>
          <div class="muted" style="font-size:12px;margin-top:4px">Placed ${payDate(o.created_at)} · ${payStatusLabel(o)}</div></div>
        <div style="text-align:right"><div class="set-price">${P(o.total)}</div>${due > 0 ? `<div class="muted" style="font-size:12px">Balance ${P(due)}</div>` : ''}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-o btn-s" style="width:auto" onclick="ppViewInvoice('${o.id}')">View invoice</button>
          ${due > 0 ? `<button class="btn btn-p btn-s" style="width:auto" onclick="ppShowTab('payment')">Send payment</button>` : ''}
          <button class="btn btn-o btn-s" style="width:auto" onclick="ppShowTab('track')">Track order</button></div></div>`; }).join('') : '');
}

/* ─── Lines, prices, weight ─── */
function ckLineInfo(l) {
  if (l.kind === 'set') {
    const st = SHOP.sets.find(x => x.set_key === l.set_key);
    return { name: st ? st.name : 'Set', sub: st ? st.pcs + ' pcs, variants chosen by us' : '', unit: st ? Number(st.price) : 0 };
  }
  const sku = l.kind === 'product' ? SHOP.skus.find(x => x.id === l.sku_id)
    : SHOP.skus.filter(x => x.product_name === l.product_name).sort((a, b) => a.retail_price_direct - b.retail_price_direct)[0];
  if (!sku) return { name: 'Item no longer available', sub: '', unit: 0, gone: true };
  return { name: sku.product_name, sub: l.kind === 'assorted' ? 'Assorted, variants chosen by us' : (sku.variant || ''), unit: ppUnitPrice(sku, PP.draft) };
}
function ckProductsTotal() { return PP.draft.reduce((n, l) => { const i = ckLineInfo(l); return n + i.unit * l.qty; }, 0); }
function ckProductKg() {
  let g = 0;
  const maxW = pn => Math.max(0, ...SHOP.skus.filter(s => s.product_name === pn).map(s => Number(s.weight_g) || 0));
  PP.draft.forEach(l => {
    if (l.kind === 'set') { const st = SHOP.sets.find(x => x.set_key === l.set_key); if (st) g += st.contents.reduce((n, c) => n + c.qty * maxW(c.product_name), 0) * l.qty; }
    else if (l.kind === 'product') { const s = SHOP.skus.find(x => x.id === l.sku_id); if (s) g += (Number(s.weight_g) || 0) * l.qty; }
    else g += maxW(l.product_name) * l.qty;
  });
  return g / 1000;
}
function ckWeightKg() { const kg = ckProductKg(); return kg + partnerPackingKg(kg); }   // SPX / J&T: product weight plus the packing add-on
function ckRegion() {
  if (CK.sel === 'new') return CK.f.region || '';
  const a = CK.addresses.find(x => x.id === CK.sel); return a ? a.region_id || '' : '';
}
function ckShipping() {
  const r = ckRegion(); if (!r) return { fee: null, note: 'Choose your region to see shipping' };
  if (CK.courier === 'lbc') {
    const f = getLbcRate(ckProductKg());   // LBC is priced on product weight only, no packing add-on
    return f == null ? { fee: 0, lbc: true, note: 'Your order is over 19 kg, so we add the LBC fee after you order (we send an updated invoice)' } : { fee: f, note: '' };
  }
  const fee = getShippingRate(r, ckWeightKg());
  return { fee, note: '' };
}

function ckRenderLines() {
  const box = ppEl('ck-lines'); if (!box) return;
  box.innerHTML = PP.draft.map((l, i) => { const x = ckLineInfo(l);
    return `<div class="ck-line"><div class="nm">${ppEsc(x.name)}<small>${ppEsc(x.sub)}</small></div>
      <div class="ck-q"><button onclick="ckQty(${i},-1)" aria-label="Less">−</button><span>${l.qty}</span><button onclick="ckQty(${i},1)" aria-label="More">+</button></div>
      <div style="min-width:78px;text-align:right;font-weight:500">${P(x.unit * l.qty)}</div>
      <button class="ck-x" onclick="ckRemove(${i})" aria-label="Remove">✕</button></div>`; }).join('');
}
function ckQty(i, d) { PP.draft[i].qty = Math.max(1, PP.draft[i].qty + d); ppSaveDraft(); ckRenderLines(); ckRenderTotals(); }
function ckRemove(i) {
  PP.draft.splice(i, 1); ppSaveDraft();
  if (!PP.draft.length) ppShowTab('checkout'); else { ckRenderLines(); ckRenderTotals(); }
}

/* ─── Address ─── */
function ckRenderAddr() {
  const box = ppEl('ck-addr'); if (!box) return;
  const full = CK.addresses.length >= 5;
  const regionOpts = '<option value="">Select your region</option>' + SHIPPING_RATES.map(r => `<option value="${r.id}" ${CK.f.region === r.id ? 'selected' : ''}>${ppEsc(r.label)}</option>`).join('');
  box.innerHTML = CK.addresses.map(a => `<label class="opt ${CK.sel === a.id ? 'on' : ''}"><input type="radio" name="ck-a" ${CK.sel === a.id ? 'checked' : ''} onchange="ckPickAddr('${a.id}')">
      <span><b>${ppEsc(a.label || a.recipient_name)}</b><small>${ppEsc(a.recipient_name)}${a.contact_number ? ', ' + ppEsc(a.contact_number) : ''}<br>${ppEsc(a.address)}<br>${ppEsc(a.region_label || '')}</small></span></label>`).join('') +
    `<label class="opt ${CK.sel === 'new' ? 'on' : ''}"><input type="radio" name="ck-a" ${CK.sel === 'new' ? 'checked' : ''} onchange="ckPickAddr('new')"><span><b>Deliver to a new address</b></span></label>
    ${CK.sel === 'new' ? `<div style="margin-top:10px">
      <label class="lbl">Address name (optional)</label><input class="inp" placeholder="e.g. Main property, Branch 2" value="${ppEsc(CK.f.label)}" oninput="CK.f.label=this.value;ckPersist()">
      <label class="lbl">Recipient name <span class="req">*</span></label><input class="inp" value="${ppEsc(CK.f.name)}" oninput="CK.f.name=this.value;ckPersist()">
      <label class="lbl">Contact number <span class="req">*</span></label><input class="inp" type="tel" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX (11 digits)" value="${ppEsc(CK.f.phone)}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,11);CK.f.phone=this.value;ckPersist()">
      <label class="lbl">Full address <span class="req">*</span></label><textarea class="inp" rows="3" placeholder="Street, barangay, city or municipality, province, postal code" oninput="CK.f.address=this.value;ckPersist()">${ppEsc(CK.f.address)}</textarea>
      <label class="lbl">Region <span class="req">*</span></label><select class="inp" onchange="ckPickRegion(this.value)">${regionOpts}</select>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        ${full ? `<span class="hint" style="margin:0">You have 5 saved addresses, so this one is used for this order only.</span>`
               : `<button type="button" class="btn btn-o btn-s" style="width:auto" id="ck-saveaddr" onclick="ckSaveAddress()">💾 Save address</button><span class="hint" style="margin:0" id="ck-saved-note">Saves it for your next orders.</span>`}
      </div></div>` : ''}`;
}
function ckReadNewAddress() {
  const f = CK.f;
  if (!f.name.trim() || !f.phone.trim() || !f.address.trim() || !f.region) return { err: 'Please fill in the recipient, contact number, address and region.' };
  if (!/^\d{11}$/.test(f.phone.trim())) return { err: 'The contact number must be 11 digits, numbers only (for example 09171234567).' };
  return { a: { label: f.label.trim() || null, recipient_name: f.name.trim(), contact_number: f.phone.trim(), address: f.address.trim(),
    region_id: f.region, region_label: (SHIPPING_RATES.find(r => r.id === f.region) || {}).label || '' } };
}
async function ckSaveAddress() {
  const n = ppEl('ck-saved-note'), r0 = ckReadNewAddress();
  if (r0.err) { if (n) { n.textContent = r0.err; n.style.color = 'var(--danger)'; } return; }
  const btn = ppEl('ck-saveaddr'); if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partner_addresses`, { method: 'POST', headers: { ...ppHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify({ partner_id: PP.session.user.id, ...r0.a }) });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && out.message) || 'We could not save the address.');
    CK.addresses.push(out[0]); CK.sel = out[0].id;
    CK.f = { label: '', name: PP.partner.contact_name || '', phone: PP.partner.contact_number || '', address: '', region: '' };
    ckPersist(); ckRenderAddr(); ckRenderCourier(); ckRenderTotals(); ppToast('Address saved ✓');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save address'; }
    if (n) { n.textContent = e.message; n.style.color = 'var(--danger)'; }
  }
}
function ckPickAddr(id) { CK.sel = id; ckPersist(); ckRenderAddr(); ckFixCourier(); ckRenderCourier(); ckRenderTotals(); }
function ckPickRegion(v) { CK.f.region = v; ckPersist(); ckFixCourier(); ckRenderCourier(); ckRenderTotals(); }

/* ─── Courier (LBC is offered for Palawan) ─── */
function ckFixCourier() { if (ckRegion() !== 'palawan' && CK.courier === 'lbc') CK.courier = 'spx'; }
function ckRenderCourier() {
  const box = ppEl('ck-courier'); if (!box) return;
  if (!ckRegion()) { box.innerHTML = '<p class="muted" style="font-size:13px">Choose where it is going and your courier options appear here.</p>'; return; }
  const palawan = ckRegion() === 'palawan';
  box.innerHTML = `<label class="opt ${CK.courier !== 'lbc' ? 'on' : ''}"><input type="radio" name="ck-c" ${CK.courier !== 'lbc' ? 'checked' : ''} onchange="ckPickCourier('spx')"><span><b>SPX / J&amp;T</b><small>Standard shipping, fee shown in your total</small></span></label>` +
    (palawan ? `<label class="opt ${CK.courier === 'lbc' ? 'on' : ''}"><input type="radio" name="ck-c" ${CK.courier === 'lbc' ? 'checked' : ''} onchange="ckPickCourier('lbc')"><span><b>LBC</b><small>Fee shown in your total</small></span></label>` : '');
}
function ckPickCourier(c) { CK.courier = c; ckPersist(); ckRenderCourier(); ckRenderTotals(); }

function ckRenderTotals() {
  const box = ppEl('ck-totals'); if (!box) return;
  const sub = ckProductsTotal(), sh = ckShipping();
  const shipTxt = sh.fee == null ? '—' : sh.lbc ? 'Added later' : P(sh.fee);
  box.innerHTML = `<div class="tot"><span>Products</span><span>${P(sub)}</span></div>
    <div class="tot"><span>Shipping</span><span>${shipTxt}</span></div>
    ${sh.note ? `<div class="muted" style="font-size:12px;line-height:1.5">${ppEsc(sh.note)}</div>` : ''}
    <div class="tot big"><span>Total</span><span>${P(sub + (sh.fee || 0))}</span></div>`;
  if (!CK.amountEdited) { CK.amount = String(Math.round((sub + (sh.fee || 0)) * 100) / 100); const a = ppEl('ck-amount'); if (a) a.value = CK.amount; }
}

/* ─── Payment: choose the method, see the QR code, enter the amount, upload the screenshot ─── */
function ckRenderPay() {
  const box = ppEl('ck-pay'); if (!box) return;
  box.innerHTML = `<p class="muted" style="font-size:13px;line-height:1.55;margin-bottom:10px">Pay with GCash, bank or e-wallet, then upload the screenshot. You can also do this later from the Payment tab.</p>
    <label class="lbl">Pay using</label>
    <select class="inp" onchange="ckPickMethod(this.value)"><option value="">Choose GCash, bank or e-wallet</option>
      ${Object.keys(PAY_METHODS).map(k => `<option value="${k}" ${CK.method === k ? 'selected' : ''}>${PAY_METHODS[k].label}</option>`).join('')}</select>
    <div id="ck-qr">${payQrHtml(PAY_METHODS[CK.method])}</div>
    <label class="lbl">Amount you are sending (₱)</label>
    <input class="inp" id="ck-amount" type="number" min="1" step="0.01" inputmode="decimal" value="${ppEsc(CK.amount)}" oninput="CK.amount=this.value;CK.amountEdited=true;ckPersist()">
    <p class="hint" style="margin-top:-6px">Filled in with your order total. You can send part now and the rest later.</p>
    <label class="lbl">Screenshot of your payment</label>
    <input class="inp" type="file" accept="image/*" onchange="CK.file=this.files[0]||null">
    <p class="hint" style="margin:-6px 0 0">If you refresh this page, you will need to attach the screenshot again. Everything else is saved.</p>`;
}
function ckPickMethod(v) { CK.method = v; ckPersist(); const q = ppEl('ck-qr'); if (q) q.innerHTML = payQrHtml(PAY_METHODS[v]); }

/* ─── Place the order ─── */
function ckErr(m) { const b = ppEl('ck-err'); b.textContent = m; b.style.display = 'block'; b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
async function ckPlace() {
  if (CK.busy) return;
  ppEl('ck-err').style.display = 'none';
  if (PP.draft.some(l => ckLineInfo(l).gone)) return ckErr('An item in your order is no longer available. Please remove it.');
  let a;
  if (CK.sel === 'new') { const r0 = ckReadNewAddress(); if (r0.err) return ckErr(r0.err); a = r0.a; }
  else a = CK.addresses.find(x => x.id === CK.sel);
  const sh = ckShipping();
  if (sh.fee == null) return ckErr('Please choose your region so we can work out shipping.');
  // Payment is optional here, but if they started it, it must be complete
  const amt = Math.round(parseFloat(CK.amount) * 100) / 100;
  const paying = !!(CK.method || CK.file);
  if (paying) {
    if (!CK.method) return ckErr('Please choose how you paid, or clear the screenshot to pay later.');
    if (!CK.file) return ckErr('Please upload the screenshot of your payment, or choose "Choose GCash, bank or e-wallet" to pay later.');
    if (!(amt > 0)) return ckErr('Please enter the amount you are sending.');
  }
  CK.busy = true; const btn = ppEl('ck-place'); btn.disabled = true; btn.textContent = 'Submitting your order...';
  let o, payMsg = '';
  try {
    const courier = CK.courier === 'lbc' ? 'lbc' : ((PP.partner.couriers || []).find(c => c !== 'lbc') || 'spx');
    const items = PP.draft.map(l => l.kind === 'set' ? { kind: 'set', set_key: l.set_key, qty: l.qty }
      : l.kind === 'product' ? { kind: 'product', sku_id: l.sku_id, qty: l.qty } : { kind: 'assorted', product_name: l.product_name, qty: l.qty });
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partner_orders`, { method: 'POST', headers: { ...ppHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify({ partner_id: PP.session.user.id, recipient_name: a.recipient_name, contact_number: a.contact_number, address: a.address,
        region_id: a.region_id, region_label: a.region_label, items, shipping_fee: sh.fee, courier, notes: (CK.notes || '').trim() || null }) });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && out.message) || 'We could not place your order.');
    o = out[0];
  } catch (e) {
    CK.busy = false; btn.disabled = false; btn.textContent = 'Submit order'; ckErr(e.message); return;
  }
  // The order exists now: empty the cart and the saved form straight away, so it can never be placed twice
  PP.draft = []; ppSaveDraft(); ckClearSaved(); PP.lastOrder = o;
  if (paying) {
    try {
      const file = CK.file;
      const path = `proof/partner_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const up = await fetch(`${SB_URL}/storage/v1/object/proof-of-payment/${path}`, { method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': file.type || 'image/jpeg' }, body: file });
      if (!up.ok) throw new Error('upload');
      const url = `${SB_URL}/storage/v1/object/public/proof-of-payment/${path}`;
      const pr = await fetch(`${SB_URL}/rest/v1/rpc/mcc_partner_submit_payment`, { method: 'POST', headers: ppHeaders(true),
        body: JSON.stringify({ p_order_id: o.id, p_method: CK.method, p_proof_url: url, p_amount: Math.min(amt, Number(o.total)) }) });
      if (!pr.ok) throw new Error('rpc');
      payMsg = 'sent';
    } catch (e) { payMsg = 'failed'; }
  }
  CK.file = null; CK.method = ''; CK.busy = false;
  ckShowDone(o, payMsg);
}

function ckShowDone(o, payMsg) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  if (typeof ppRenderBar === 'function') ppRenderBar();
  const note = payMsg === 'sent' ? '<p style="font-size:13.5px;line-height:1.6;margin:10px 0 14px">We received your payment screenshot. We will check it and start preparing your order. You just have to wait for our confirmation.</p>'
    : payMsg === 'failed' ? '<p style="font-size:13.5px;line-height:1.6;margin:10px 0 14px;color:var(--danger)">Your order is placed, but the payment screenshot did not go through. Please send it from the Payment tab.</p>'
    : '<p style="font-size:13.5px;line-height:1.6;margin:10px 0 14px">Your order is placed. Send your payment from the Payment tab whenever you are ready, and we will start preparing it once we confirm it.</p>';
  const lbc = o.courier === 'lbc' && !Number(o.shipping_fee) ? '<p class="muted" style="font-size:12.5px;line-height:1.55">We will add the LBC shipping fee and send you an updated invoice.</p>' : '';
  ppEl('tab-body').innerHTML = `<div class="card center" style="max-width:520px;margin:1rem auto">
    <div style="font-size:34px">🌿</div><h2>Thank you, your order is submitted</h2>
    <p style="margin:6px 0 4px"><span class="badge">${ppEsc(o.order_code)}</span></p>
    <div class="tot big" style="border-top:none"><span>Total</span><span>${P(o.total)}</span></div>${lbc}${note}
    <button class="btn btn-p" onclick="ppViewInvoice('${o.id}')">View invoice</button>
    <button class="btn btn-o" style="margin-top:8px" onclick="ppShowTab('${payMsg === 'failed' || !payMsg ? 'payment' : 'track'}')">${payMsg === 'failed' || !payMsg ? 'Go to Payment' : 'Track my order'}</button>
    <button class="btn btn-o" style="margin-top:8px" onclick="ppShowTab('order')">Back to shop</button></div>`;
  window.scrollTo({ top: 0 });
  if (typeof ppShowReceipt === 'function') ppShowReceipt(o);   // the printed-receipt animation (invoice.js)
}
