/* ============================================================
   PARTNER PORTAL: PAYMENT TAB
   Shows every order that still has something to pay, the invoice (with revisions),
   and lets the partner send a payment proof for the full balance or part of it.
   ppInvoiceHtml() is also used by the Track and History tabs later.
   ============================================================ */
const PAY_METHODS = {
  gcash:    { label: 'GCash',     img: 'https://static.wixstatic.com/media/d7782b_4f0c7227f5424c28b52a1b3e510258c6~mv2.png' },
  bdo:      { label: 'BDO',       img: 'https://static.wixstatic.com/media/d7782b_711c8ee305b64c8da7db6d4c9d8c1557~mv2.png' },
  gotyme:   { label: 'GoTyme',    img: 'https://static.wixstatic.com/media/d7782b_8c9282b35fb444328bb65bd83fc49439~mv2.png' },
  maribank: { label: 'Maribank',  img: 'https://static.wixstatic.com/media/d7782b_759677dabeb04f238fe987a1728b7153~mv2.png' },
  cimb:     { label: 'CIMB Bank', img: 'https://static.wixstatic.com/media/d7782b_c0ffca6de8094dc59dd09ddd5bfb46f1~mv2.png' }
};
const PAY = { orders: [], payments: [], invoices: [], form: {}, files: {}, busy: {} };

/* Loads this partner's orders, payments and invoice history (shared by Home, Payment, Track and History) */
async function ppLoadPartnerData(includeCancelled) {
  const [orders, payments, invoices] = await Promise.all([
    ppRest('mcc_partner_orders?' + (includeCancelled ? '' : 'is_cancelled=eq.false&') + 'select=*&order=created_at.desc'),
    ppRest('mcc_partner_payments?select=*&order=submitted_at.asc'),
    ppRest('mcc_partner_invoices?select=*&order=rev.asc')
  ]);
  Object.assign(PAY, { orders: includeCancelled ? orders : orders.filter(o => !o.is_cancelled), payments, invoices });
}

async function ppRenderPayment(body) {
  try {
    await ppLoadPartnerData(false);
  } catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your payments</h2>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Please check your connection and try again.</p>
      <button class="btn btn-p" style="max-width:260px;margin:0 auto" onclick="ppShowTab('payment')">Try again</button></div>`;
    return;
  }
  const open = PAY.orders.filter(o => payBalance(o) > 0 || payPending(o) > 0);
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">Payment</h2>
    <p class="sec-sub">Send your payment, then upload the screenshot. We check it and start preparing your order. You can pay in parts.</p>` +
    (open.length ? open.map(payOrderCard).join('') :
      `<div class="card center"><h2>Nothing to pay right now ✓</h2><p class="muted" style="font-size:13px">When you place an order or we send a revised invoice, it appears here.</p></div>`);
}

function payPending(o) { return PAY.payments.filter(p => p.order_id === o.id && p.status === 'submitted').reduce((n, p) => n + Number(p.amount), 0); }
function payBalance(o) { return Math.max(0, Number(o.total) - Number(o.amount_paid) - payPending(o)); }
function payStatusLabel(o) {
  return { unpaid: 'Waiting for payment', proof_submitted: 'Payment is being checked', partial: 'Partly paid', paid: 'Paid' }[o.pay_status] || o.pay_status;
}
function payDate(d) { return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

/* ─── Invoice (used here and in other tabs) ─── */
function ppLineLabel(i) {
  if (i.kind === 'set') return { n: i.name, s: (i.contents || []).map(c => c.qty * i.qty + ' ' + c.product_name).join(', ') };
  if (i.kind === 'assorted') return { n: i.name, s: 'Assorted' };
  return { n: i.name, s: i.variant || '' };
}
function ppInvoiceHtml(o, rev) {
  const inv = rev ? (PAY.invoices.find(v => v.order_id === o.id && v.rev === rev) || o) : o;
  return `<div class="inv">${(inv.items || []).map(i => { const l = ppLineLabel(i);
      return `<div class="ck-line"><div class="nm">${ppEsc(l.n)}<small>${ppEsc(l.s)}</small></div><div class="muted" style="font-size:12.5px">${i.qty} × ${P(i.unit_price)}</div><div style="min-width:80px;text-align:right">${P(i.line_total)}</div></div>`; }).join('')}
    <div class="tot"><span>Products</span><span>${P(inv.subtotal)}</span></div>
    <div class="tot"><span>Shipping${o.courier ? ' (' + (o.courier === 'lbc' ? 'LBC' : 'SPX / J&T') + ')' : ''}</span><span>${P(inv.shipping_fee)}</span></div>
    <div class="tot big"><span>Invoice total</span><span>${P(inv.total)}</span></div></div>`;
}
function payToggleInv(oid) { const b = ppEl('inv-' + oid); if (b) b.style.display = b.style.display === 'none' ? 'block' : 'none'; }

function payOrderCard(o) {
  const due = payBalance(o), pend = payPending(o);
  const mine = PAY.payments.filter(p => p.order_id === o.id);
  const earlier = PAY.invoices.filter(v => v.order_id === o.id && v.rev < o.invoice_rev);
  const f = PAY.form[o.id] = PAY.form[o.id] || { method: '', amount: due };
  const stLabel = { submitted: 'Waiting for our check', verified: 'Confirmed', rejected: 'Not accepted' };
  return `<div class="card" id="po-${o.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <div><span class="badge" style="margin:0">${ppEsc(o.order_code)}</span> ${o.invoice_rev > 1 ? `<span class="badge" style="margin:0;background:var(--warn-bg);color:var(--warn)">Revised invoice ${o.invoice_rev}</span>` : ''}
        <div class="muted" style="font-size:12px;margin-top:4px">Placed ${payDate(o.created_at)} · ${payStatusLabel(o)}</div></div>
      <div style="text-align:right"><div class="muted" style="font-size:12px">Balance due</div><div class="set-price">${P(due)}</div></div>
    </div>
    <div class="row"><span>Invoice total</span><b>${P(o.total)}</b></div>
    <div class="row"><span>Confirmed payments</span><b>${P(o.amount_paid)}</b></div>
    ${pend > 0 ? `<div class="row"><span>Waiting for our check</span><b>${P(pend)}</b></div>` : ''}
    <button class="ck-x" style="font-size:13px;color:var(--lagoon);padding:8px 0" onclick="payToggleInv('${o.id}')">View invoice ▾</button>
    <div id="inv-${o.id}" style="display:none">${ppInvoiceHtml(o)}
      ${earlier.length ? `<div class="hint" style="margin:10px 0 0">Earlier versions: ${earlier.map(v => `Invoice ${v.rev} was ${P(v.total)}`).join(', ')}${o.revision_note ? '. ' + ppEsc(o.revision_note) : ''}</div>` : ''}</div>
    ${mine.length ? `<div style="margin-top:10px">${mine.map(p => `<div class="row"><span>${payDate(p.submitted_at)} · ${PAY_METHODS[p.method] ? PAY_METHODS[p.method].label : ppEsc(p.method)}</span><b>${P(p.amount)} · ${stLabel[p.status] || p.status}</b></div>`).join('')}</div>` : ''}
    ${due > 0 ? payFormHtml(o, f, due) : `<p class="muted" style="font-size:13px;margin-top:10px">${pend > 0 ? 'Thank you, we are checking your payment.' : ''}</p>`}
  </div>`;
}

function payFormHtml(o, f, due) {
  const m = PAY_METHODS[f.method];
  return `<div style="margin-top:14px;border-top:1px solid var(--sand);padding-top:14px">
    <label class="lbl">Pay using</label>
    <select class="inp" onchange="payPick('${o.id}',this.value)"><option value="">Choose GCash, bank or e-wallet</option>
      ${Object.keys(PAY_METHODS).map(k => `<option value="${k}" ${f.method === k ? 'selected' : ''}>${PAY_METHODS[k].label}</option>`).join('')}</select>
    <div id="pqr-${o.id}">${payQrHtml(m)}</div>
    <label class="lbl">Amount you are sending</label>
    <input class="inp" type="number" min="1" max="${due}" step="0.01" inputmode="decimal" value="${f.amount}" oninput="PAY.form['${o.id}'].amount=this.value">
    <p class="hint" style="margin-top:-6px">Balance due is ${P(due)}. You can send part of it now and the rest later.</p>
    <label class="lbl">Screenshot of your payment</label>
    <input class="inp" type="file" accept="image/*" onchange="payFile('${o.id}',this)">
    <div id="perr-${o.id}" class="auth-err"></div>
    <button class="btn btn-p" id="pbtn-${o.id}" onclick="paySubmit('${o.id}')">Send payment proof</button>
  </div>`;
}
function payQrHtml(m) {
  return m ? `<div class="center" style="margin-bottom:12px"><img src="${m.img}" alt="${m.label} QR code" referrerpolicy="no-referrer" style="max-width:230px;width:100%;border-radius:10px;border:1px solid var(--sand)"></div>` : '';
}
function payPick(oid, v) { PAY.form[oid].method = v; ppEl('pqr-' + oid).innerHTML = payQrHtml(PAY_METHODS[v]); }
function payFile(oid, input) { PAY.files[oid] = input.files[0] || null; }
function payErr(oid, m) { const b = ppEl('perr-' + oid); b.textContent = m; b.style.display = 'block'; }

async function paySubmit(oid) {
  if (PAY.busy[oid]) return;
  const o = PAY.orders.find(x => x.id === oid), f = PAY.form[oid], file = PAY.files[oid], due = payBalance(o);
  ppEl('perr-' + oid).style.display = 'none';
  const amt = Math.round(parseFloat(f.amount) * 100) / 100;
  if (!f.method) return payErr(oid, 'Please choose how you paid.');
  if (!(amt > 0) || amt > due + 0.001) return payErr(oid, 'Please enter an amount between ₱1 and ' + P(due) + '.');
  if (!file) return payErr(oid, 'Please upload a screenshot of your payment.');
  PAY.busy[oid] = true; const btn = ppEl('pbtn-' + oid); btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const path = `proof/partner_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const up = await fetch(`${SB_URL}/storage/v1/object/proof-of-payment/${path}`, { method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': file.type || 'image/jpeg' }, body: file });
    if (!up.ok) throw new Error('The screenshot did not upload. Please try again.');
    const url = `${SB_URL}/storage/v1/object/public/proof-of-payment/${path}`;
    const r = await fetch(`${SB_URL}/rest/v1/rpc/mcc_partner_submit_payment`, { method: 'POST', headers: ppHeaders(true),
      body: JSON.stringify({ p_order_id: oid, p_method: f.method, p_proof_url: url, p_amount: amt }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'We could not record your payment.'); }
    delete PAY.files[oid]; delete PAY.form[oid];
    ppToast('Payment proof sent. We will check it soon.');
    ppShowTab('payment');
  } catch (e) {
    PAY.busy[oid] = false; btn.disabled = false; btn.textContent = 'Send payment proof'; payErr(oid, e.message);
    return;
  }
  PAY.busy[oid] = false;
}
