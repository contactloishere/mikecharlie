/* ============================================================
   PARTNER PORTAL: MY SETTINGS (opened from the "Hi, (business)" menu in the header)
   1. Business details: business name, contact person, contact number (11 digits), Hotel / Retail
   2. Login email (changing it sends a confirmation link to the new address)
   3. Saved addresses: add, edit or delete (up to 5), used at checkout
   Courier options and account status are changed by Mike Charlie Co. only.
   ============================================================ */
const ST = { addresses: [], editing: null, f: {}, msg: {} };

async function ppRenderSettings(body) {
  try { ST.addresses = await ppRest('mcc_partner_addresses?select=*&order=created_at.asc'); }
  catch (e) {
    body.innerHTML = `<div class="card center"><h2>We could not load your settings</h2>
      <button class="btn btn-p" style="max-width:240px;margin:0 auto" onclick="ppShowTab('settings')">Try again</button></div>`; return;
  }
  ST.editing = null; ST.msg = {};
  stDraw(body);
}
function stBody() { return ppEl('tab-body'); }
function stNote(k) { const m = ST.msg[k]; return m ? `<div class="${m.ok ? 'auth-ok' : 'auth-err'}" style="display:block;margin-top:10px;padding:9px 12px;font-size:13px;border-radius:8px">${ppEsc(m.t)}</div>` : ''; }
function stReadOnly() { return PP.viewAs ? 'disabled' : ''; }

function stDraw(body) {
  body = body || stBody(); if (!body) return;
  const p = PP.partner, ro = stReadOnly();
  body.innerHTML = `<h2 class="sec-title" style="margin-top:.4rem">My Settings</h2>
    ${PP.viewAs ? '<p class="hint" style="margin:0 0 12px">Owner view: settings can be seen but not changed.</p>' : ''}
    <div class="card"><h2>Business details</h2>
      <label class="lbl">Business name <span class="req">*</span></label><input class="inp" id="st-biz" value="${ppEsc(p.business_name)}" ${ro}>
      <label class="lbl">Contact person <span class="req">*</span></label><input class="inp" id="st-name" value="${ppEsc(p.contact_name || '')}" ${ro}>
      <label class="lbl">Contact number <span class="req">*</span></label><input class="inp" id="st-phone" type="tel" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX (11 digits)" value="${ppEsc(p.contact_number || '')}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,11)" ${ro}>
      <label class="lbl">We are a</label>
      <div style="display:flex;gap:18px;margin-bottom:12px;font-size:14px">
        <label style="display:flex;gap:7px;align-items:center"><input type="checkbox" id="st-hotel" ${p.is_hotel ? 'checked' : ''} ${ro}> Hotel or stay</label>
        <label style="display:flex;gap:7px;align-items:center"><input type="checkbox" id="st-retail" ${p.is_retail ? 'checked' : ''} ${ro}> Retail store</label></div>
      <button class="btn btn-p" style="width:auto;padding:10px 22px" onclick="stSaveDetails()" ${ro}>Save details</button>${stNote('details')}</div>

    <div class="card"><h2>Login email</h2>
      <p class="muted" style="font-size:13.5px;margin-bottom:10px">${ppEsc((PP.session.user && PP.session.user.email) || '')}</p>
      <label class="lbl">New email</label><input class="inp" id="st-email" type="email" placeholder="new@email.com" ${ro}>
      <button class="btn btn-o" style="width:auto;padding:10px 22px" onclick="stSaveEmail()" ${ro}>Change email</button>
      <p class="hint" style="margin:8px 0 0">We send a confirmation link to the new address. Your email stays the same until you open it. If you log in with Google, your Google email is used.</p>${stNote('email')}</div>

    <div class="card"><h2>Saved addresses (${ST.addresses.length} of 5)</h2>
      <div id="st-addrs">${ST.addresses.map(stAddrHtml).join('') || '<p class="muted" style="font-size:13.5px">No saved addresses yet.</p>'}</div>
      ${ST.editing === 'new' ? stFormHtml() : (ST.addresses.length < 5 ? `<button class="btn btn-o" style="width:auto;padding:10px 22px;margin-top:10px" onclick="stEdit('new')" ${ro}>+ Add address</button>` : '<p class="hint" style="margin:10px 0 0">You have 5 saved addresses. Delete one to add another.</p>')}
      ${stNote('addr')}</div>`;
}

function stAddrHtml(a) {
  if (ST.editing === a.id) return `<div class="opt on" style="display:block">${stFormHtml()}</div>`;
  return `<div class="opt" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
    <span><b>${ppEsc(a.label || a.recipient_name)}</b><small style="display:block">${ppEsc(a.recipient_name)}${a.contact_number ? ', ' + ppEsc(a.contact_number) : ''}<br>${ppEsc(a.address)}<br>${ppEsc(a.region_label || '')}</small></span>
    <span style="display:flex;gap:6px;flex-shrink:0"><button class="btn btn-o btn-s" style="width:auto;padding:7px 12px" onclick="stEdit('${a.id}')" ${stReadOnly()}>Edit</button>
    <button class="btn btn-o btn-s" style="width:auto;padding:7px 12px" onclick="stDelete('${a.id}')" ${stReadOnly()}>Delete</button></span></div>`;
}
function stFormHtml() {
  const f = ST.f, opts = '<option value="">Select your region</option>' + SHIPPING_RATES.map(r => `<option value="${r.id}" ${f.region === r.id ? 'selected' : ''}>${ppEsc(r.label)}</option>`).join('');
  return `<div style="margin-top:8px">
    <label class="lbl">Address name (optional)</label><input class="inp" id="sa-label" placeholder="e.g. Main property, Branch 2" value="${ppEsc(f.label)}">
    <label class="lbl">Recipient name <span class="req">*</span></label><input class="inp" id="sa-name" value="${ppEsc(f.name)}">
    <label class="lbl">Contact number <span class="req">*</span></label><input class="inp" id="sa-phone" type="tel" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX (11 digits)" value="${ppEsc(f.phone)}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,11)">
    <label class="lbl">Full address <span class="req">*</span></label><textarea class="inp" id="sa-addr" rows="3" placeholder="Street, barangay, city or municipality, province, postal code">${ppEsc(f.address)}</textarea>
    <label class="lbl">Region <span class="req">*</span></label><select class="inp" id="sa-region">${opts}</select>
    <div style="display:flex;gap:8px"><button class="btn btn-p" style="width:auto;padding:10px 22px" onclick="stSaveAddr()">Save address</button>
    <button class="btn btn-o" style="width:auto;padding:10px 22px" onclick="stEdit(null)">Cancel</button></div></div>`;
}
function stEdit(id) {
  ST.msg.addr = null; ST.editing = id;
  if (id === 'new') ST.f = { id: null, label: '', name: PP.partner.contact_name || '', phone: PP.partner.contact_number || '', address: '', region: '' };
  else if (id) { const a = ST.addresses.find(x => x.id === id); ST.f = { id, label: a.label || '', name: a.recipient_name || '', phone: a.contact_number || '', address: a.address || '', region: a.region_id || '' }; }
  stDraw();
}

async function stSaveDetails() {
  const biz = ppEl('st-biz').value.trim(), name = ppEl('st-name').value.trim(), phone = ppEl('st-phone').value.trim();
  const hotel = ppEl('st-hotel').checked, retail = ppEl('st-retail').checked;
  const fail = t => { ST.msg.details = { ok: false, t }; stDraw(); };
  if (!biz || !name) return fail('Please fill in the business name and contact person.');
  if (!/^\d{11}$/.test(phone)) return fail('The contact number must be 11 digits, numbers only (for example 09171234567).');
  if (!hotel && !retail) return fail('Please choose Hotel or stay, Retail store, or both.');
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partners?id=eq.${PP.session.user.id}`, { method: 'PATCH', headers: { ...ppHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify({ business_name: biz, contact_name: name, contact_number: phone, is_hotel: hotel, is_retail: retail }) });
    const out = await r.json().catch(() => null);
    if (!r.ok || !out || !out[0]) throw new Error('save');
    Object.assign(PP.partner, out[0]);
    if (typeof ppRememberPartner === 'function') ppRememberPartner();
    ST.msg.details = { ok: true, t: 'Saved ✓' }; stDraw(); ppRenderBar();
  } catch (e) { fail('We could not save your details. Please try again.'); }
}

async function stSaveEmail() {
  const em = ppEl('st-email').value.trim();
  const fail = t => { ST.msg.email = { ok: false, t }; stDraw(); };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail('Please enter a valid email address.');
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { method: 'PUT', headers: ppHeaders(true), body: JSON.stringify({ email: em }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.msg || out.message || 'email');
    ST.msg.email = { ok: true, t: 'Almost done. Please open the confirmation link we sent to ' + em + '.' }; stDraw();
  } catch (e) { fail('We could not change your email. Please check it and try again.'); }
}

async function stSaveAddr() {
  const f = ST.f = { id: ST.f.id, label: ppEl('sa-label').value.trim(), name: ppEl('sa-name').value.trim(), phone: ppEl('sa-phone').value.trim(), address: ppEl('sa-addr').value.trim(), region: ppEl('sa-region').value };
  const fail = t => { ST.msg.addr = { ok: false, t }; stDraw(); };
  if (!f.name || !f.phone || !f.address || !f.region) return fail('Please fill in the recipient, contact number, address and region.');
  if (!/^\d{11}$/.test(f.phone)) return fail('The contact number must be 11 digits, numbers only (for example 09171234567).');
  const row = { label: f.label || null, recipient_name: f.name, contact_number: f.phone, address: f.address, region_id: f.region, region_label: (SHIPPING_RATES.find(r => r.id === f.region) || {}).label || '' };
  try {
    const r = f.id
      ? await fetch(`${SB_URL}/rest/v1/mcc_partner_addresses?id=eq.${f.id}`, { method: 'PATCH', headers: { ...ppHeaders(true), Prefer: 'return=representation' }, body: JSON.stringify(row) })
      : await fetch(`${SB_URL}/rest/v1/mcc_partner_addresses`, { method: 'POST', headers: { ...ppHeaders(true), Prefer: 'return=representation' }, body: JSON.stringify({ partner_id: PP.session.user.id, ...row }) });
    const out = await r.json().catch(() => null);
    if (!r.ok || !out || !out[0]) throw new Error('save');
    ST.addresses = f.id ? ST.addresses.map(a => a.id === f.id ? out[0] : a) : ST.addresses.concat([out[0]]);
    ST.editing = null; ST.msg.addr = { ok: true, t: 'Address saved ✓' }; stDraw();
  } catch (e) { fail('We could not save the address. Please try again.'); }
}

async function stDelete(id) {
  if (!confirm('Delete this saved address?')) return;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mcc_partner_addresses?id=eq.${id}`, { method: 'DELETE', headers: ppHeaders() });
    if (!r.ok) throw new Error('delete');
    ST.addresses = ST.addresses.filter(a => a.id !== id); ST.msg.addr = { ok: true, t: 'Address deleted.' }; stDraw();
  } catch (e) { ST.msg.addr = { ok: false, t: 'We could not delete it. Please try again.' }; stDraw(); }
}
