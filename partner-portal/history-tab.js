/* ============================================================
   PARTNER PORTAL: HISTORY TAB
   Every order ever placed, with its invoice, and an "Order again" button
   that puts the same items back into a new order.
   ============================================================ */
async function ppRenderHistory(body) {
  try { await ppLoadPartnerData(true); } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your history</h2><button class="btn btn-p" style="max-width:260px;margin:12px auto 0" onclick="ppShowTab('history')">Try again</button></div>`; return;
  }
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">Order history</h2>
    <p class="sec-sub">All your orders. Tap "Order again" to start a new order with the same items.</p>` +
    (PAY.orders.length ? PAY.orders.map(o => {
      const st = o.is_cancelled ? 'Cancelled' : (PSTAGES.find(s => s.id === o.current_stage) || PSTAGES[0]).label;
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><span class="badge" style="margin:0">${ppEsc(o.order_code)}</span><div class="muted" style="font-size:12px;margin-top:4px">${payDate(o.created_at)} · ${st}</div></div>
          <div class="set-price" style="font-size:1.35rem">${P(o.total)}</div></div>
        ${trkBoxHtml(o)}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">
          <button class="btn btn-o btn-s" style="width:auto;padding:8px 14px" onclick="ppViewInvoice('${o.id}')">📄 View invoice</button>
          <button class="btn btn-o btn-s" style="width:auto;padding:8px 14px" onclick="ppDownloadInvoice('${o.id}')">⬇ Download</button>
          <button class="btn btn-o btn-s" style="width:auto;padding:8px 14px" onclick="histReorder('${o.id}')">Order again</button></div>
      </div>`; }).join('') :
      `<div class="card center"><h2>No orders yet</h2><button class="btn btn-p" style="max-width:260px;margin:12px auto 0" onclick="ppShowTab('order')">Start your first order</button></div>`);
}

/* Puts the order's items back into the draft (custom lines like fees are not copied) */
function histReorder(oid) {
  const o = PAY.orders.find(x => x.id === oid); if (!o) return;
  let n = 0;
  (o.items || []).forEach(i => {
    if (i.kind === 'set' && i.set_key) { ppAddLine({ kind: 'set', set_key: i.set_key, qty: i.qty }); n++; }
    else if (i.kind === 'product' && i.sku_id) { ppAddLine({ kind: 'product', sku_id: i.sku_id, qty: i.qty }); n++; }
    else if (i.kind === 'assorted' && i.name) { ppAddLine({ kind: 'assorted', product_name: i.name, qty: i.qty }); n++; }
  });
  if (!n) { ppToast('Nothing to copy from this order'); return; }
  ppToast('Items added to a new order');
  ppShowTab('checkout');
}
