/* ============================================================
   PARTNER PORTAL: CHECKOUT (opened from "Review order" in the New Order tab)
   Order lines, saved addresses (5 max), courier, instructions, totals, place order.
   Shipping weight = product weight + the box and padding allowance (partnerPackingKg).
   The allowance is never shown to the partner. Prices are checked again by the database.
   ============================================================ */
const CK = { addresses: [], sel: 'new', courier: 'spx', notes: '', f: {}, saveNew: true, busy: false };

function ppShowCheckout() { ppShowTab('checkout'); }

async function ppRenderCheckout(body) {
  if (!PP.draft || !PP.draft.length) {
    body.innerHTML = `<div class="card center"><h2>Your order is empty</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Add some sets or products first.</p>
      <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('order')">Go to New Order</button></div>`;
    return;
  }
  try {
    await ppLoadShop();
    CK.addresses = await ppRest('mcc_partner_addresses?select=*&order=created_at.asc');
  } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load checkout</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again.</p>
      <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('checkout')">Try again</button></div>`;
    return;
  }
  CK.sel = CK.addresses.length ? CK.addresses[0].id : 'new';
  CK.f = { label: '', name: PP.partner.contact_name || '', phone: PP.partner.contact_number || '', address: '', region: '' };
  CK.notes = ''; CK.saveNew = true; CK.busy = false;
  body.innerHTML = `<button class="ck-x" style="font-size:13px;color:var(--lagoon);margin-bottom:6px" onclick="ppShowTab('order')">← Back to shop</button>
    <h2 class="sec-title" style="margin-top:0">Review your order</h2>
    <div class="ck-grid"><div>
      <div class="card"><h2>Your items</h2><div id="ck-lines"></div></div>
      <div class="card"><h2>Deliver to</h2><div id="ck-addr"></div></div>
      <div class="card"><h2>Courier</h2><div id="ck-courier"></div></div>
      <div class="card"><h2>Instructions or message (optional)</h2>
        <textarea class="inp" id="ck-notes" rows="3" placeholder="Custom wrapping, branding, delivery notes, anything we should know" oninput="CK.notes=this.value"></textarea></div>
    </div><div>
      <div class="card" style="position:sticky;top:90px"><h2>Order total</h2><div id="ck-totals"></div>
        <div id="ck-err" class="auth-err" style="margin-top:12px"></div>
        <button class="btn btn-p" id="ck-place" style="margin-top:12px" onclick="ckPlace()">Place order</button>
        <p class="muted" style="font-size:12px;line-height:1.55;margin-top:10px;text-align:center">You pay after placing the order. We check your payment, then start preparing it.</p></div>
    </div></div>`;
  ckRenderLines(); ckRenderAddr(); ckRenderCourier(); ckRenderTotals();
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
function ckWeightKg() {
  let g = 0;
  const maxW = pn => Math.max(0, ...SHOP.skus.filter(s => s.product_name === pn).map(s => Number(s.weight_g) || 0));
  PP.draft.forEach(l => {
    if (l.kind === 'set') { const st = SHOP.sets.find(x => x.set_key === l.set_key); if (st) g += st.contents.reduce((n, c) => n + c.qty * maxW(c.product_name), 0) * l.qty; }
    else if (l.kind === 'product') { const s = SHOP.skus.find(x => x.id === l.sku_id); if (s) g += (Number(s.weight_g) || 0) * l.qty; }
    else g += maxW(l.product_name) * l.qty;
  });
  const kg = g / 1000;
  return kg + partnerPackingKg(kg);
}
function ckRegion() {
  if (CK.sel === 'new') return CK.f.region || '';
  const a = CK.addresses.find(x => x.id === CK.sel); return a ? a.region_id || '' : '';
}
function ckShipping() {
  const r = ckRegion(); if (!r) return { fee: null, note: 'Choose your region to see shipping' };
  if (CK.courier === 'lbc') return { fee: 0, lbc: true, note: 'LBC fee is added by us after you order (we send an updated invoice)' };
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
      <label class="lbl">Address name (optional)</label><input class="inp" placeholder="e.g. Main property, Branch 2" value="${ppEsc(CK.f.label)}" oninput="CK.f.label=this.value">
      <label class="lbl">Recipient name <span class="req">*</span></label><input class="inp" value="${ppEsc(CK.f.name)}" oninput="CK.f.name=this.value">
      <label class="lbl">Contact number <span class="req">*</span></label><input class="inp" type="tel" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX (11 digits)" value="${ppEsc(CK.f.phone)}" oninput="this.value=this.value.replace(/\D/g,'').slice(0,11);CK.f.phone=this.value">
      <label class="lbl">Full address <span class="req">*</span></label><textarea class="inp" rows="3" placeholder="Street, barangay, city or municipality, province, postal code" oninput="CK.f.address=this.value">${ppEsc(CK.f.address)}</textarea>
      <label class="lbl">Region <span class="req">*</span></label><select class="inp" onchange="ckPickRegion(this.value)">${regionOpts}</select>
      ${full ? `<p class="hint" style="margin:0">You have 5 saved addresses, so this one is used for this order only.</p>`
             : `<label style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text-mid)"><input type="checkbox" ${CK.saveNew ? 'checked' : ''} onchange="CK.saveNew=this.checked" style="accent-color:var(--lagoon)"> Save this address for next time</label>`}
    </div>` : ''}`;
}
function ckPickAddr(id) { CK.sel = id; ckRenderAddr(); ckFixCourier(); ckRenderCourier(); ckRenderTotals(); }
function ckPickRegion(v) { CK.f.region = v; ckFixCourier(); ckRenderCourier(); ckRenderTotals(); }

/* ─── Courier (LBC is offered for Palawan) ─── */
function ckFixCourier() { if (ckRegion() !== 'palawan' && CK.courier === 'lbc') CK.courier = 'spx'; }
function ckRenderCourier() {
  const box = ppEl('ck-courier'); if (!box) return;
  if (!ckRegion()) { box.innerHTML = '<p class="muted" style="font-size:13px">Choose where it is going and your courier options appear here.</p>'; return; }
  const palawan = ckRegion() === 'palawan';
  box.innerHTML = `<label class="opt ${CK.courier !== 'lbc' ? 'on' : ''}"><input type="radio" name="ck-c" ${CK.courier !== 'lbc' ? 'checked' : ''} onchange="ckPickCourier('spx')"><span><b>SPX / J&amp;T</b><small>Standard shipping, fee shown in your total</small></span></label>` +
    (palawan ? `<label class="opt ${CK.courier === 'lbc' ? 'on' : ''}"><input type="radio" name="ck-c" ${CK.courier === 'lbc' ? 'checked' : ''} onchange="ckPickCourier('lbc')"><span><b>LBC</b><small>We add the LBC fee to your invoice after you order</small></span></label>` : '');
}
function ckPickCourier(c) { CK.courier = c; ckRenderCourier(); ckRenderTotals(); }

function ckRenderTotals() {
  const box = ppEl('ck-totals'); if (!box) return;
  const sub = ckProductsTotal(), sh = ckShipping();
  const shipTxt = sh.fee == null ? '—' : sh.lbc ? 'Added later' : P(sh.fee);
  box.innerHTML = `<div class="tot"><span>Products</span><span>${P(sub)}</span></div>
    <div class="tot"><span>Shipping</span><span>${shipTxt}</span></div>
    ${sh.note ? `<div class="muted" style="font-size:12px;line-height:1.5">${ppEsc(sh.note)}</div>` : ''}
    <div class="tot big"><span>Total</span><span>${P(sub + (sh.fee || 0))}</span></div>`;
}

/* ─── Place the order ─── */
function ckErr(m) { const b = ppEl('ck-err'); b.textContent = m; b.style.display = 'block'; b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
async function ckPlace() {
  if (CK.busy) return;
  ppEl('ck-err').style.display = 'none';
  if (PP.draft.some(l => ckLineInfo(l).gone)) return ckErr('An item in your order is no longer available. Please remove it.');
  let a;
  if (CK.sel === 'new') {
    const f = CK.f;
    if (!f.name.trim() || !f.phone.trim() || !f.address.trim() || !f.region) return ckErr('Please fill in the recipient, contact number, address and region.');
    if (!/^\d{11}$/.test(f.phone.trim())) return ckErr('The contact number must be 11 digits, numbers only (for example 09171234567).');
    a = { label: f.label.trim() || null, recipient_name: f.name.trim(), contact_number: f.phone.trim(), address: f.address.trim(),
          region_id: f.region, region_label: (SHIPPING_RATES.find(r => r.id === f.region) || {}).label || '' };
  } else a = CK.addresses.find(x => x.id === CK.sel);
  const sh = ckShipping();
  if (sh.fee == null) return ckErr('Please choose your region so we can work out shipping.');
  CK.busy = true; const btn = ppEl('ck-place'); btn.disabled = true; btn.textContent = 'Placing your order...';
  try {
    if (CK.sel === 'new' && CK.saveNew && CK.addresses.length < 5) {
      const r = await fetch(`${SB_URL}/rest/v1/mcc_partner_addresses`, { method: 'POST', headers: { ...ppHeaders(true), Prefer: 'return=minimal' },
        body: JSON.stringify({ partner_id: PP.session.user.id, ...a }) });
      if (!r.ok) console.warn('address not saved'); // the order still goes through
    }
    const courier = CK.courier === 'lbc' ? 'lbc' : ((PP.partner.couriers || []).find(c => c !== 'lbc') || 'spx');
    const items = PP.draft.map(l => l.kind === 'set' ? { kind: 'set', set_key: l.set_key, qty: l.qty }
      : l.kind === 'product' ? { kind: 'product', sku_id: l.sku_id, qty: l.qty } : { kind: 'assorted', product_name: l.product_name, qty: l.qty });
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partner_orders`, { method: 'POST', headers: { ...ppHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify({ partner_id: PP.session.user.id, recipient_name: a.recipient_name, contact_number: a.contact_number, address: a.address,
        region_id: a.region_id, region_label: a.region_label, items, shipping_fee: sh.fee, courier, notes: (CK.notes || '').trim() || null }) });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && out.message) || 'We could not place your order.');
    const o = out[0];
    PP.draft = []; ppSaveDraft(); PP.lastOrder = o;
    ppEl('tab-body').innerHTML = `<div class="card center" style="max-width:520px;margin:1rem auto">
      <div style="font-size:34px">🌿</div><h2>Thank you, your order is placed</h2>
      <p style="margin:6px 0 14px"><span class="badge">${ppEsc(o.order_code)}</span></p>
      <div class="tot big" style="border-top:none"><span>Total</span><span>${P(o.total)}</span></div>
      ${courier === 'lbc' ? '<p class="muted" style="font-size:12.5px;line-height:1.55">We will add the LBC shipping fee and send you an updated invoice.</p>' : ''}
      <p class="muted" style="font-size:13px;line-height:1.6;margin:10px 0 14px">Next, send your payment so we can start preparing your order.</p>
      <button class="btn btn-p" onclick="ppShowTab('payment')">Pay for this order</button>
      <button class="btn btn-o" style="margin-top:8px" onclick="ppShowTab('order')">Back to shop</button></div>`;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    if (typeof ppRenderBar === 'function') ppRenderBar();
  } catch (e) {
    CK.busy = false; btn.disabled = false; btn.textContent = 'Place order'; ckErr(e.message);
  }
}
