/* ============================================================
   PARTNER PORTAL: VARIANT PICKER (opened from a product card in shop-tab.js)
   1. Select a variant from the dropdown (or "Assorted").
   2. Type how many (up and down buttons), then "Add to order".
   3. Assorted: type how many, then either leave it to us, or tick "I want to choose the variants":
      a checklist appears ("All variants" ticks every one), the total is split evenly across the ticked
      variants (13,13,13,13,12,12,12,12 for 100 over 8) and every row can be changed by hand.
   The sheet stays open after adding, so the partner can add the next variant, and shows what is
   already in the order from this product. The price per piece and the "add N more" nudge update live.
   ============================================================ */
const PK = { name: '', skus: [], mode: '', qty: 1, choose: false, sel: {}, rows: {}, canAssort: false };

function ppShowPicker(name) {
  const pr = SHOP.products.find(p => p.name === name); if (!pr) return;
  PK.name = name; PK.skus = pr.skus;
  // products priced per variant group (e.g. Femme Cup) are picked by hand, no "Assorted"
  PK.canAssort = !ppTiersFor(name).some(t => t.variant) && pr.skus.length > 1;
  pkReset();
  let ov = ppEl('pk-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pk-overlay'; ov.className = 'pk-overlay'; ov.onclick = e => { if (e.target === ov) pkClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="pk-sheet" role="dialog" aria-modal="true">
    <button class="pk-x" onclick="pkClose()" aria-label="Close">✕</button>
    <h2>${ppEsc(name)}</h2>
    <div id="pk-in"></div>
    <label class="lbl" for="pk-select">Select variant</label>
    <select class="inp" id="pk-select" onchange="pkPick(this.value)">
      <option value="">Select variant</option>
      ${pr.skus.map(s => `<option value="${s.id}">${ppEsc(s.variant || s.product_name)}</option>`).join('')}
      ${PK.canAssort ? '<option value="assorted">Assorted (we pick the variants)</option>' : ''}
    </select>
    <div id="pk-body"></div>
  </div>`;
  ov.classList.add('show'); document.body.style.overflow = 'hidden';
  pkRender();
}
function pkReset() { PK.mode = ''; PK.qty = 1; PK.choose = false; PK.sel = {}; PK.rows = {}; }
function pkClose() {
  const ov = ppEl('pk-overlay'); if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

/* ─── What the partner has chosen ─── */
function pkSelected() { return PK.skus.filter(s => PK.sel[s.id]); }
function pkResplit() {
  const sel = pkSelected(); PK.rows = {};
  if (!sel.length || PK.qty < 1) return;
  const base = Math.floor(PK.qty / sel.length), rem = PK.qty % sel.length;
  sel.forEach((s, i) => { PK.rows[s.id] = base + (i < rem ? 1 : 0); });
}
function pkAllocated() { return pkSelected().reduce((n, s) => n + (PK.rows[s.id] || 0), 0); }
function pkPick(v) { PK.mode = v; PK.qty = 1; PK.choose = false; PK.sel = {}; PK.rows = {}; pkRender(); }
function pkSetQty(v) { PK.qty = Math.max(0, parseInt(v, 10) || 0); pkResplit(); pkRenderChoice(); pkRenderSum(); }
function pkStep(d) { PK.qty = Math.max(1, (PK.qty || 0) + d); const i = ppEl('pk-qty'); if (i) i.value = PK.qty; pkResplit(); pkRenderChoice(); pkRenderSum(); }
function pkSetChoose(on) { PK.choose = on; PK.sel = {}; PK.rows = {}; pkRenderChoice(); pkRenderSum(); }
function pkToggle(id, on) { PK.sel[id] = on; pkResplit(); pkRenderChoice(); pkRenderSum(); }
function pkToggleAll(on) { PK.skus.forEach(s => { PK.sel[s.id] = on; }); pkResplit(); pkRenderChoice(); pkRenderSum(); }
function pkEditRow(id, v) { PK.rows[id] = Math.max(0, parseInt(v, 10) || 0); pkRenderSum(); }

/* Lines that "Add to order" would add right now */
function pkLines() {
  if (!PK.mode || PK.qty < 1) return [];
  if (PK.mode !== 'assorted') return [{ kind: 'product', sku_id: PK.mode, qty: PK.qty }];
  if (!PK.choose) return [{ kind: 'assorted', product_name: PK.name, qty: PK.qty }];
  return pkSelected().filter(s => PK.rows[s.id] > 0).map(s => ({ kind: 'product', sku_id: s.id, qty: PK.rows[s.id] }));
}
function pkPriceRows() {
  const mine = pkLines(), all = (PP.draft || []).concat(mine);
  return mine.map(l => {
    const sku = l.kind === 'product' ? PK.skus.find(s => s.id === l.sku_id) : PK.skus.slice().sort((a, b) => a.retail_price_direct - b.retail_price_direct)[0];
    return { line: l, sku, unit: ppUnitPrice(sku, all) };
  });
}
function pkNudge(rows) {
  if (!rows.length) return '';
  const all = (PP.draft || []).concat(rows.map(r => r.line));
  // closest higher tier that would lower the price of the first chosen variant
  const r = rows[0], cands = ppTiersFor(PK.name).filter(t => ppMatchVariant(t.variant, r.sku.variant));
  let best = null;
  cands.forEach(t => {
    const pooled = ppPooled(all, PK.name, t.variant), need = t.min_qty - pooled;
    if (need > 0 && Number(t.unit_price) < r.unit && (!best || need < best.need)) best = { need, price: Number(t.unit_price), save: r.unit - Number(t.unit_price) };
  });
  return best ? `<div class="pk-nudge">Add <b>${best.need}</b> more pc${best.need === 1 ? '' : 's'} to pay <b>${P(best.price)}</b> each (save ${P(best.save)} per piece)</div>` : '';
}

/* ─── Drawing ─── */
function pkInOrder() {
  // what is already in the order from this product
  const ids = new Set(PK.skus.map(s => s.id));
  const lines = (PP.draft || []).filter(l => (l.kind === 'product' && ids.has(l.sku_id)) || (l.kind === 'assorted' && l.product_name === PK.name));
  const box = ppEl('pk-in'); if (!box) return;
  if (!lines.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="pk-in"><b>Already in your order:</b> ${lines.map(l => {
    const nm = l.kind === 'assorted' ? 'Assorted' : ((PK.skus.find(s => s.id === l.sku_id) || {}).variant || PK.name);
    return `<span class="pk-chip">${ppEsc(nm)} × ${l.qty}</span>`;
  }).join('')}</div>`;
}
function pkRender() {
  pkInOrder();
  const body = ppEl('pk-body'); if (!body) return;
  if (!PK.mode) { body.innerHTML = `<button class="btn btn-o" onclick="pkClose()" style="margin-top:14px">Done</button>`; return; }
  const assorted = PK.mode === 'assorted';
  body.innerHTML = `<label class="lbl" for="pk-qty" style="margin-top:12px">How many ${assorted ? 'in total' : 'pieces'}?</label>
    <div class="stepper pk-stepper"><button type="button" onclick="pkStep(-1)" aria-label="Fewer">−</button>
      <input id="pk-qty" type="number" min="1" inputmode="numeric" value="${PK.qty}" oninput="pkSetQty(this.value)">
      <button type="button" onclick="pkStep(1)" aria-label="More">+</button></div>
    ${assorted ? `<label class="pk-choose"><input type="checkbox" id="pk-choose" ${PK.choose ? 'checked' : ''} onchange="pkSetChoose(this.checked)"> <span>I want to choose the variants<br><small>Leave this unticked and we will pick the variants for you.</small></span></label>` : ''}
    <div id="pk-vars"></div>
    <div id="pk-sum"></div>`;
  pkRenderChoice(); pkRenderSum();
}
function pkRenderChoice() {
  const box = ppEl('pk-vars'); if (!box) return;
  if (PK.mode !== 'assorted') { box.innerHTML = ''; return; }
  if (!PK.choose) { box.innerHTML = `<div class="pk-note">Assorted: we pick which variants go in your order and let you know.</div>`; return; }
  const allOn = PK.skus.every(s => PK.sel[s.id]);
  box.innerHTML = `<div class="lbl" style="margin:10px 0 6px">Tick the variants you want</div>
    <label class="pk-row pk-all"><input type="checkbox" ${allOn ? 'checked' : ''} onchange="pkToggleAll(this.checked)"> <span>All variants</span></label>
    ${PK.skus.map(s => `<div class="pk-row">
      <label style="display:flex;align-items:center;gap:9px;flex:1;min-width:0"><input type="checkbox" ${PK.sel[s.id] ? 'checked' : ''} onchange="pkToggle('${s.id}',this.checked)"><span>${ppEsc(s.variant || s.product_name)}</span></label>
      ${PK.sel[s.id] ? `<input class="pk-q" type="number" min="0" inputmode="numeric" value="${PK.rows[s.id] || 0}" oninput="pkEditRow('${s.id}',this.value)" aria-label="Pieces of ${ppEsc(s.variant || '')}">` : ''}
    </div>`).join('')}`;
}
function pkRenderSum() {
  const box = ppEl('pk-sum'); if (!box) return;
  const rows = pkPriceRows(), pcs = rows.reduce((n, r) => n + r.line.qty, 0);
  let ok = PK.qty > 0, counter = '';
  if (PK.mode === 'assorted' && PK.choose) {
    const left = PK.qty - pkAllocated();
    ok = PK.qty > 0 && pkSelected().length > 0 && left === 0;
    if (PK.qty > 0 && pkSelected().length) counter = left === 0 ? `<div class="pk-count good">All ${PK.qty} pieces assigned ✓</div>`
      : `<div class="pk-count bad">${left > 0 ? left + ' more to assign' : -left + ' too many'} (${pkAllocated()} of ${PK.qty})</div>`;
    else if (PK.qty > 0) counter = `<div class="pk-count">Tick the variants you want</div>`;
  }
  const total = rows.reduce((n, r) => n + r.unit * r.line.qty, 0);
  const units = [...new Set(rows.map(r => r.unit))];
  const priceTxt = !rows.length ? '' : units.length === 1 ? `<b>${P(units[0])}</b> per piece` : `<b>${P(Math.min(...units))}</b> to <b>${P(Math.max(...units))}</b> per piece`;
  box.innerHTML = `${counter}
    ${rows.length ? `<div class="pk-price"><div>${priceTxt}</div><div class="pk-tot">${P(total)}</div></div>${pkNudge(rows)}` : ''}
    <button class="btn btn-p" ${ok ? '' : 'disabled'} onclick="pkAdd()" style="margin-top:12px">${ok ? `Add ${pcs} pc${pcs === 1 ? '' : 's'} to order` : 'Add to order'}</button>
    <button class="btn btn-o" onclick="pkClose()" style="margin-top:8px">Done</button>`;
}

function pkAdd() {
  const lines = pkLines(); if (!lines.length) return;
  lines.forEach(l => ppAddLine(l));
  ppToast('Added to your order ✓');
  pkReset();
  const sel = ppEl('pk-select'); if (sel) sel.value = '';
  pkRender();   // sheet stays open so the next variant can be added; "Done" closes it
}
