/* ============================================================
   PARTNER PORTAL: HOME TAB
   What needs attention, what is on the way, and quick buttons.
   ============================================================ */
async function ppRenderHome(body) {
  try { await ppLoadPartnerData(false); } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your account</h2><button class="btn btn-p" style="max-width:260px;margin:12px auto 0" onclick="ppShowTab('home')">Try again</button></div>`; return;
  }
  const p = PP.partner, name = (p.contact_name || '').split(' ')[0] || p.business_name;
  const due = PAY.orders.filter(o => payBalance(o) > 0);
  const dueTotal = due.reduce((n, o) => n + payBalance(o), 0);
  const active = PAY.orders.filter(o => o.current_stage !== 'delivered');
  const revised = PAY.orders.filter(o => o.invoice_rev > 1 && payBalance(o) > 0);
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">Welcome, ${ppEsc(name)} 🌿</h2>
    <p class="sec-sub">Everything for ${ppEsc(p.business_name)} in one place.</p>
    ${due.length ? `<div class="card" style="border-color:var(--golden)"><h2>Payment needed</h2>
      <p style="font-size:14px;color:var(--text-mid);margin-bottom:12px">You have <b>${due.length}</b> order${due.length === 1 ? '' : 's'} waiting for payment, <b>${P(dueTotal)}</b> in total.${revised.length ? ' We sent a revised invoice for ' + revised.map(o => ppEsc(o.order_code)).join(', ') + '.' : ''}</p>
      <button class="btn btn-p" style="max-width:260px" onclick="ppShowTab('payment')">Go to Payment</button></div>` : ''}
    <div class="card"><h2>On the way</h2>
      ${active.length ? active.slice(0, 3).map(o => `<div class="row"><span><b style="color:var(--text-dark)">${ppEsc(o.order_code)}</b><br><span style="font-size:12px">${(PSTAGES.find(s => s.id === o.current_stage) || PSTAGES[0]).label}</span></span><b>${P(o.total)}</b></div>`).join('') +
        `<button class="btn btn-o btn-s" style="max-width:220px;margin-top:12px" onclick="ppShowTab('track')">Track my orders</button>`
        : '<p class="muted" style="font-size:13px">No orders in progress.</p>'}</div>
    <div class="card"><h2>Order</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-p" style="width:auto;padding:12px 22px" onclick="ppShowTab('order')">Start a new order</button>
        <button class="btn btn-o" style="width:auto;padding:12px 22px" onclick="ppShowTab('history')">Order again from history</button>
        <a class="btn btn-o" style="width:auto;padding:12px 22px;text-decoration:none" href="https://wa.me/message/T7LXVS3L74A5C1" target="_blank" rel="noopener">Message us</a></div></div>`;
}
