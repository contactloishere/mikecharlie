/* ============================================================
   PARTNER PORTAL: VARIANT PICKER (opened from a product card in shop-tab.js)
   1. The partner types a total number of pieces.
   2. Ticks the variants they want ("All" ticks every one), or chooses "Assorted"
      and lets Mike Charlie Co. pick the variants.
   3. The total is split evenly across the ticked variants (13,13,13,13,12,12,12,12 for 100 over 8).
      Any row can be changed by hand, a live counter shows what is left to assign.
   The price per piece and the "add N more" nudge update as they go.
   ============================================================ */
const PK = { name: '', skus: [], assorted: false, total: 0, sel: {}, qty: {} };

function ppShowPicker(name) {
  const pr = SHOP.products.find(p => p.name === name); if (!pr) return;
  PK.name = name; PK.skus = pr.skus; PK.assorted = false; PK.total = 0; PK.sel = {}; PK.qty = {};
  PK.canAssort = !ppTiersFor(name).some(t => t.variant); // products priced per variant group (e.g. Femme Cup) are picked by hand
  let ov = ppEl('pk-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pk-overlay'; ov.className = 'pk-overlay'; ov.onclick = e => { if (e.target === ov) pkClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="pk-sheet" role="dialog" aria-modal="true">
    <button class="pk-x" onclick="pkClose()" aria-label="Close">✕</button>
    <h2>${ppEsc(name)}</h2>
    <label class="lbl" for="pk-total">How many pieces in total?</label>
    <input class="inp" id="pk-total" type="number" min="1" inputmode="numeric" placeholder="e.g. 100" oninput="pkSetTotal(this.value)">
    ${PK.canAssort ? `<label class="type-card" id="pk-assort-card" style="margin-bottom:12px"><input type="checkbox" id="pk-assort" onchange="pkSetAssorted(this.checked)"> <span><b>Assorted</b><br><span class="muted" style="font-size:12px">We choose the variants for you</span></span></label>` : ''}
    <div id="pk-vars"></div>
    <div id="pk-sum"></div>
  </div>`;
  ov.classList.add('show'); document.body.style.overflow = 'hidden';
  pkRenderRows(); pkRenderSum();
  setTimeout(() => { const t = ppEl('pk-total'); if (t) t.focus(); }, 60);
}
function pkClose() {
  const ov = ppEl('pk-overlay'); if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

/* ─── The even split ─── */
function pkSelected() { return PK.skus.filter(s => PK.sel[s.id]); }
function pkResplit() {
  const sel = pkSelected(); PK.qty = {};
  if (!sel.length || PK.total < 1) return;
  const base = Math.floor(PK.total / sel.length), rem = PK.total % sel.length;
  sel.forEach((s, i) => { PK.qty[s.id] = base + (i < rem ? 1 : 0); });
}
function pkAllocated() { return pkSelected().reduce((n, s) => n + (PK.qty[s.id] || 0), 0); }

function pkSetTotal(v) { PK.total = Math.max(0, parseInt(v, 10) || 0); pkResplit(); pkRenderRows(); pkRenderSum(); }
function pkToggle(id, on) { PK.sel[id] = on; pkResplit(); pkRenderRows(); pkRenderSum(); }
function pkToggleAll(on) { PK.skus.forEach(s => { PK.sel[s.id] = on; }); pkResplit(); pkRenderRows(); pkRenderSum(); }
function pkSetAssorted(on) {
  PK.assorted = on; const c = ppEl('pk-assort-card'); if (c) c.classList.toggle('on', on);
  pkRenderRows(); pkRenderSum();
}
function pkEditRow(id, v) { PK.qty[id] = Math.max(0, parseInt(v, 10) || 0); pkRenderSum(); }

/* ─── Prices for what is chosen right now (together with what is already in the order) ─── */
function pkLines() {
  if (PK.assorted) return PK.total > 0 ? [{ kind: 'assorted', product_name: PK.name, qty: PK.total }] : [];
  return pkSelected().filter(s => PK.qty[s.id] > 0).map(s => ({ kind: 'product', sku_id: s.id, qty: PK.qty[s.id] }));
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
  // find the closest higher tier that would lower the price of the first chosen variant
  const r = rows[0], cands = ppTiersFor(PK.name).filter(t => ppMatchVariant(t.variant, r.sku.variant));
  let best = null;
  cands.forEach(t => {
    const pooled = ppPooled(all, PK.name, t.variant), need = t.min_qty - pooled;
    if (need > 0 && Number(t.unit_price) < r.unit && (!best || need < best.need)) best = { need, price: Number(t.unit_price), save: r.unit - Number(t.unit_price) };
  });
  return best ? `<div class="pk-nudge">Add <b>${best.need}</b> more pc${best.need === 1 ? '' : 's'} to pay <b>${P(best.price)}</b> each (save ${P(best.save)} per piece)</div>` : '';
}

/* ─── Drawing ─── */
function pkRenderRows() {
  const box = ppEl('pk-vars'); if (!box) return;
  if (PK.assorted) { box.innerHTML = `<div class="pk-note">Assorted: we pick which variants go in your order and let you know.</div>`; return; }
  const allOn = PK.skus.every(s => PK.sel[s.id]);
  box.innerHTML = `<div class="lbl" style="margin-bottom:6px">Choose variants</div>
    <label class="pk-row pk-all"><input type="checkbox" ${allOn ? 'checked' : ''} onchange="pkToggleAll(this.checked)"> <span>All variants</span></label>
    ${PK.skus.map(s => `<div class="pk-row">
      <label style="display:flex;align-items:center;gap:9px;flex:1;min-width:0"><input type="checkbox" ${PK.sel[s.id] ? 'checked' : ''} onchange="pkToggle('${s.id}',this.checked)"><span>${ppEsc(s.variant || s.product_name)}</span></label>
      ${PK.sel[s.id] ? `<input class="pk-q" type="number" min="0" inputmode="numeric" value="${PK.qty[s.id] || 0}" oninput="pkEditRow('${s.id}',this.value)" aria-label="Pieces of ${ppEsc(s.variant || '')}">` : ''}
    </div>`).join('')}`;
}
function pkRenderSum() {
  const box = ppEl('pk-sum'); if (!box) return;
  const rows = pkPriceRows(), pcs = rows.reduce((n, r) => n + r.line.qty, 0);
  let ok, counter = '';
  if (PK.assorted) ok = PK.total > 0;
  else {
    const left = PK.total - pkAllocated();
    ok = PK.total > 0 && pkSelected().length > 0 && left === 0;
    if (PK.total > 0 && pkSelected().length) counter = left === 0 ? `<div class="pk-count good">All ${PK.total} pieces assigned ✓</div>`
      : `<div class="pk-count bad">${left > 0 ? left + ' more to assign' : -left + ' too many'} (${pkAllocated()} of ${PK.total})</div>`;
    else if (PK.total > 0) counter = `<div class="pk-count">Tick the variants you want</div>`;
  }
  const total = rows.reduce((n, r) => n + r.unit * r.line.qty, 0);
  const units = [...new Set(rows.map(r => r.unit))];
  const priceTxt = !rows.length ? '' : units.length === 1 ? `<b>${P(units[0])}</b> per piece` : `<b>${P(Math.min(...units))}</b> to <b>${P(Math.max(...units))}</b> per piece`;
  box.innerHTML = `${counter}
    ${rows.length ? `<div class="pk-price"><div>${priceTxt}</div><div class="pk-tot">${P(total)}</div></div>${pkNudge(rows)}` : ''}
    <button class="btn btn-p" ${ok ? '' : 'disabled'} onclick="pkAdd()" style="margin-top:12px">${ok ? `Add ${pcs} pcs to my order` : 'Add to my order'}</button>`;
}

function pkAdd() {
  pkLines().forEach(l => ppAddLine(l));
  pkClose(); ppToast('Added to your order');
}
