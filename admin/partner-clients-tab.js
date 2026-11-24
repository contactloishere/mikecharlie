/* ─────────────────────────────────────────────────────────
   PARTNER CLIENTS TAB
   Hotel and retail partner orders (mcc_partner_orders), their payments and invoices.
   You can: confirm or reject payment proofs, record a payment yourself, edit an order
   (quantities, items, custom lines like a label design fee, shipping, address) which
   sends the partner a revised invoice, choose variants for assorted items and sets,
   tick the tracking stages after payment clears, and cancel.
   Stock and the sale are recorded automatically once the order is paid AND every
   assorted line has its variants (same method as member orders).
   Uses helpers from shared.js: $, P, toast, sbGet, sbInsert, sbUpdate, sbDelete, sbRpc, S, initInventoryData.
   ───────────────────────────────────────────────────────── */
const PC={partners:[],orders:[],payments:[],tiers:[],sets:[],open:null,filter:'attention',view:'orders',edit:null,assign:null,delivery:null};
const PC_STAGES=[
  {id:'placed',label:'Order placed'},{id:'paid',label:'Payment confirmed'},{id:'preparing',label:'Preparing'},
  {id:'packed',label:'Packed'},{id:'shipped',label:'Shipped Out Order'}];
const PC_METHODS={gcash:'GCash',bdo:'BDO',gotyme:'GoTyme',maribank:'Maribank',cimb:'CIMB'};
const pcEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const pc2=n=>Math.round((Number(n)||0)*100)/100;
const pcOrder=id=>PC.orders.find(o=>o.id===id);
const pcPartner=id=>PC.partners.find(p=>p.id===id)||{};

async function renderPartnerClients(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div><p>Loading partner clients...</p></div>`;
  try{
    if(!S.skus.length) await initInventoryData();
    await pcLoad();
    drawPC();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load partner clients.<br><span class="t-muted" style="font-size:12px">${pcEsc(e.message)}</span></p></div>`;
  }
}
async function pcLoad(){
  const [partners,orders,payments,tiers,sets]=await Promise.all([
    sbGet('mcc_partners','select=*&order=created_at.desc'),
    sbGet('mcc_partner_orders','select=*&order=created_at.desc'),
    sbGet('mcc_partner_payments','select=*&order=submitted_at.asc'),
    sbGet('mcc_partner_price_tiers','select=*'),
    sbGet('mcc_partner_sets','select=*&order=sort.asc')]);
  Object.assign(PC,{partners,orders,payments,tiers,sets});
  pcBadge();
}
function pcNeeds(o){
  if(o.is_cancelled)return [];
  const n=[];
  if(PC.payments.some(p=>p.order_id===o.id&&p.status==='submitted'))n.push('Check payment');
  if(!o.variants_assigned)n.push('Choose variants');
  if(o.pay_status==='paid'&&o.variants_assigned&&!o.stock_deducted)n.push('Record sale');
  return n;
}
function pcBadge(){
  const n=PC.orders.filter(o=>pcNeeds(o).length).length+PC.partners.filter(x=>!x.is_approved).length, b=$('partners-badge');
  if(b){b.textContent=n;b.style.display=n?'inline-block':'none';}
}
async function pcRefresh(keepOpen){await pcLoad();drawPC();}

/* ─── LIST ─── */
function pcPill(txt,bg,fg){return `<span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;margin-right:4px">${txt}</span>`;}
function pcPayPill(o){
  const m={unpaid:['Unpaid','#FFF0CC','#92600A'],proof_submitted:['Proof sent','#DCE8F7','#24508A'],partial:['Part paid','#FFF0CC','#92600A'],paid:['Paid','#D8F3DC','#2D6A4F']}[o.pay_status]||['?','#eee','#333'];
  return pcPill(m[0],m[1],m[2]);
}
function drawPC(){
  const inProg=o=>!o.is_cancelled&&!['shipped','delivered'].includes(o.current_stage);
  const F={
    attention:o=>pcNeeds(o).length>0, all:o=>true, unpaid:o=>!o.is_cancelled&&o.pay_status!=='paid',
    progress:inProg, done:o=>!o.is_cancelled&&['shipped','delivered'].includes(o.current_stage), cancelled:o=>o.is_cancelled};
  const chips=[['attention','Needs you'],['unpaid','Unpaid'],['progress','In progress'],['done','Shipped / delivered'],['cancelled','Cancelled'],['all','All']];
  const list=PC.orders.filter(F[PC.filter]||F.all);
  $('body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div style="display:flex;gap:6px">
        <button class="btn ${PC.view==='orders'?'btn-p':'btn-o'} btn-sm" onclick="PC.view='orders';drawPC()">Orders</button>
        <button class="btn ${PC.view==='partners'?'btn-p':'btn-o'} btn-sm" onclick="PC.view='partners';drawPC()">Partners (${PC.partners.length})${PC.partners.some(x=>!x.is_approved)?` <span style="background:var(--danger);color:#fff;border-radius:10px;padding:0 6px;font-size:10px;font-weight:700">${PC.partners.filter(x=>!x.is_approved).length} to approve</span>`:''}</button></div>
      <button class="btn btn-p btn-sm" onclick="openPartnerModal()">+ Create Partner Account</button></div>
    ${PC.view==='partners'?pcPartnersHtml():`
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${chips.map(([k,l])=>`<button class="btn ${PC.filter===k?'btn-p':'btn-o'} btn-sm" onclick="PC.filter='${k}';drawPC()">${l} (${PC.orders.filter(F[k]).length})</button>`).join('')}</div>
    ${list.length?list.map(pcCard).join(''):'<div class="empty"><div class="empty-i">🤝</div><p>Nothing here.</p></div>'}`}`;
}
function pcCard(o){
  const p=pcPartner(o.partner_id), open=PC.open===o.id, needs=pcNeeds(o);
  const types=[p.is_hotel?'Hotel':'',p.is_retail?'Retail':''].filter(Boolean).join(' + ');
  return `<div class="card" style="${needs.length?'border-color:var(--golden)':''}">
    <div style="display:flex;justify-content:space-between;gap:10px;cursor:pointer;flex-wrap:wrap" onclick="PC.open=${open?'null':`'${o.id}'`};PC.edit=null;PC.assign=null;PC.delivery=null;drawPC()">
      <div><div style="font-weight:600">${pcEsc(o.business_name||p.business_name)} <span class="t-muted" style="font-weight:400;font-size:12px">${types}</span></div>
        <div class="t-muted" style="font-size:12px">${pcEsc(o.order_code)} · ${fmtDate(o.created_at)}${o.invoice_rev>1?' · invoice '+o.invoice_rev:''}</div></div>
      <div style="text-align:right"><div style="font-weight:600">${P(o.total)}</div>
        <div>${o.is_cancelled?pcPill('Cancelled','#eee','#555'):pcPayPill(o)+pcPill((PC_STAGES.find(s=>s.id===o.current_stage)||PC_STAGES[0]).label,'#E6D5C3','#3E5F5C')}${needs.map(n=>pcPill(n,'#FFE8E8','#C1121F')).join('')}</div></div></div>
    ${open?pcDetail(o):''}</div>`;
}

/* ─── ORDER DETAIL ─── */
function pcDetail(o){
  const sec=(t,h)=>`<div style="border-top:1px solid var(--sand);margin-top:12px;padding-top:12px"><div style="font-weight:600;color:var(--lagoon);margin-bottom:8px">${t}</div>${h}</div>`;
  const warn=(o.pay_status==='paid'&&o.variants_assigned&&!o.stock_deducted&&!o.is_cancelled)?`<div style="background:#FFE8E0;border:1px solid #E8B4A0;color:#8A3418;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:13px">
    <b>Sale not recorded yet.</b> ${PC.dedErr[o.id]?pcEsc(PC.dedErr[o.id])+' ':''}It shows in Sales and moves stock once it is recorded.
    <div style="margin-top:8px"><button class="btn btn-p btn-sm" onclick="pcTryDeduct('${o.id}')">Record sale and update stock</button></div></div>`:'';
  return warn+`<div style="margin-top:10px"><button class="btn btn-o btn-sm" onclick="pcViewAs('${o.partner_id}')">👁 View as partner</button></div>`+
    sec('Payments',pcPaymentsHtml(o))+
    sec('Items and invoice',PC.edit&&PC.edit.id===o.id?pcEditHtml(o):pcItemsHtml(o))+
    (PC.assign&&PC.assign.id===o.id?sec('Choose variants',pcAssignHtml(o)):'')+
    sec('Delivery',PC.delivery===o.id?pcDeliveryEditHtml(o):pcDeliveryHtml(o))+
    sec('Progress and tracking',pcStageHtml(o))+
    (o.is_cancelled?'':`<div style="margin-top:14px"><button class="btn btn-o btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="pcCancel('${o.id}')">Cancel this order</button></div>`);
}

/* PAYMENTS */
function pcPaymentsHtml(o){
  const pays=PC.payments.filter(p=>p.order_id===o.id);
  const bal=Math.max(0,o.total-o.amount_paid);
  const stl={submitted:'Waiting for you',verified:'Confirmed',rejected:'Rejected'};
  return `<div style="font-size:13px;margin-bottom:8px">Invoice <b>${P(o.total)}</b> · confirmed <b>${P(o.amount_paid)}</b> · balance <b>${P(bal)}</b></div>`+
    pays.map(p=>`<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;padding:7px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
      <span>${fmtDate(p.submitted_at)} · ${PC_METHODS[p.method]||p.method} · <b>${P(p.amount)}</b> · ${stl[p.status]||p.status}${p.note?' ('+pcEsc(p.note)+')':''}
        ${p.proof_url?` · <a href="${pcEsc(p.proof_url)}" target="_blank" rel="noopener">view proof</a>`:''}</span>
      ${p.status==='submitted'?`<span><button class="btn btn-p btn-sm" onclick="pcPay('${p.id}','verified')">Confirm</button> <button class="btn btn-o btn-sm" onclick="pcPay('${p.id}','rejected')">Reject</button></span>`:''}</div>`).join('')+
    (o.is_cancelled?'':`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">
      <span class="t-muted" style="font-size:12px">Paid you directly?</span>
      <input class="inp" id="pm-amt-${o.id}" type="number" placeholder="Amount" style="width:110px;margin:0">
      <select class="inp" id="pm-met-${o.id}" style="width:120px;margin:0">${Object.keys(PC_METHODS).map(k=>`<option value="${k}">${PC_METHODS[k]}</option>`).join('')}</select>
      <button class="btn btn-o btn-sm" onclick="pcPayManual('${o.id}')">Record payment</button></div>`);
}
async function pcPay(pid,status){
  let note=null;
  if(status==='rejected'){note=prompt('Reason to show the partner (optional):')||null;}
  try{
    await sbUpdate('mcc_partner_payments',pid,{status,note,verified_at:new Date().toISOString()});
    const p=PC.payments.find(x=>x.id===pid);
    await pcRefresh();
    toast(status==='verified'?'✓ Payment confirmed':'Payment rejected');
    if(status==='verified')await pcTryDeduct(p.order_id);
  }catch(e){toast('Could not update: '+e.message);}
}
async function pcPayManual(oid){
  const o=pcOrder(oid), amt=pc2($('pm-amt-'+oid).value);
  if(!(amt>0)){toast('Enter the amount you received.');return;}
  try{
    await sbInsert('mcc_partner_payments',{order_id:oid,invoice_rev:o.invoice_rev,amount:amt,method:$('pm-met-'+oid).value,status:'verified',verified_at:new Date().toISOString(),note:'Recorded by admin'});
    await pcRefresh(); toast('✓ Payment recorded'); await pcTryDeduct(oid);
  }catch(e){toast('Could not record: '+e.message);}
}

/* ITEMS */
function pcLineLabel(i){
  if(i.kind==='set')return {n:i.name,s:(i.contents||[]).map(c=>c.qty*i.qty+' '+c.product_name).join(', ')};
  if(i.kind==='assorted')return {n:i.name,s:'Assorted (choose variants)'};
  if(i.kind==='custom')return {n:i.name,s:'Custom item'};
  return {n:i.name,s:i.variant||''};
}
function pcItemsHtml(o){
  const locked=o.stock_deducted;
  return (o.items||[]).map((i,idx)=>{const l=pcLineLabel(i);
    let act='';
    if(i.kind==='assorted')act=`<button class="btn btn-p btn-sm" onclick="pcAssignOpen('${o.id}',${idx},'${pcEsc(i.name).replace(/'/g,"\\'")}')">Choose variants</button>`;
    if(i.kind==='set'){
      const need=(i.contents||[]).map(c=>({pn:c.product_name,need:c.qty*i.qty,have:(i.assigned||[]).filter(a=>a.product_name===c.product_name).reduce((n,a)=>n+a.qty,0)}));
      act=need.map(n=>`<button class="btn ${n.have===n.need?'btn-o':'btn-p'} btn-sm" onclick="pcAssignOpen('${o.id}',${idx},'${pcEsc(n.pn).replace(/'/g,"\\'")}')">${pcEsc(n.pn.replace('Hotel-Sized ','').replace('Mini Sampler ','Mini '))} ${n.have}/${n.need}</button>`).join(' ');
    }
    return `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
      <div style="flex:1;min-width:180px"><b>${pcEsc(l.n)}</b> <span class="t-muted">${pcEsc(l.s)}</span>
        ${i.kind==='set'&&(i.assigned||[]).length?`<div class="t-muted" style="font-size:11.5px">${i.assigned.map(a=>{const s=S.skus.find(x=>x.id===a.sku_id);return a.qty+' '+(s?s.variant:'')}).join(', ')}</div>`:''}
        <div style="margin-top:4px">${act}</div></div>
      <div style="text-align:right;white-space:nowrap">${i.qty} × ${P(i.unit_price)}<br><b>${P(i.line_total)}</b></div></div>`;}).join('')+
    `<div style="text-align:right;font-size:13px;margin-top:8px">Products ${P(o.subtotal)} · Shipping ${P(o.shipping_fee)}<br><b style="font-size:15px">Total ${P(o.total)}</b></div>
     ${o.notes?`<div class="t-muted" style="font-size:12.5px;margin-top:6px">Partner note: ${pcEsc(o.notes)}</div>`:''}
     <div style="margin-top:10px">${locked?'<span class="t-muted" style="font-size:12px">Stock already moved, so items are locked. Shipping and delivery can still be edited. To change items, cancel and create a new order.</span> <button class="btn btn-o btn-sm" onclick="pcEditStart(\''+o.id+'\')">Edit shipping / invoice note</button>'
       :`<button class="btn btn-o btn-sm" onclick="pcEditStart('${o.id}')">Edit order and send revised invoice</button>`}</div>`;
}

/* ─── PRICING (same rule as the partner shop and the database) ─── */
function pcMatch(pat,v){if(pat==null)return true;try{return new RegExp('^'+pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*')+'$','i').test(v||'');}catch(e){return false;}}
function pcSku(id){return S.skus.find(s=>s.id===id);}
function pcBase(s){return (s.is_on_sale&&s.sale_price!=null)?Number(s.sale_price):Number(s.retail_price_direct);}
function pcPooled(lines,pn,pat){
  return lines.reduce((n,l)=>{
    if(l.kind==='set'||l.kind==='custom')return n;
    const s=l.kind==='product'?pcSku(l.sku_id):null, name=s?s.product_name:l.name;
    return name===pn&&(pat==null||(s&&pcMatch(pat,s.variant)))?n+Number(l.qty):n;},0);
}
function pcUnit(sku,lines){
  const ts=PC.tiers.filter(t=>t.product_name===sku.product_name&&pcMatch(t.variant,sku.variant)&&pcPooled(lines,sku.product_name,t.variant)>=t.min_qty).sort((a,b)=>b.min_qty-a.min_qty);
  return ts.length?Number(ts[0].unit_price):pcBase(sku);
}
function pcReprice(lines){
  lines.forEach(l=>{
    if(l.manual||l.kind==='set'||l.kind==='custom')return;
    const sku=l.kind==='product'?pcSku(l.sku_id):S.skus.filter(s=>s.product_name===l.name&&s.is_active).sort((a,b)=>a.retail_price_direct-b.retail_price_direct)[0];
    if(sku)l.unit_price=pcUnit(sku,lines);
  });
}
function pcMaxW(pn){return Math.max(0,...S.skus.filter(s=>s.product_name===pn).map(s=>Number(s.weight_g)||0));}
function pcProductKg(lines){
  let g=0;
  lines.forEach(l=>{
    if(l.kind==='product'){const s=pcSku(l.sku_id);g+=(s?Number(s.weight_g)||0:Number(l.weight_g)||0)*l.qty;}
    else if(l.kind==='assorted')g+=pcMaxW(l.name)*l.qty;
    else if(l.kind==='set')g+=(l.contents||[]).reduce((n,c)=>n+c.qty*pcMaxW(c.product_name),0)*l.qty;
  });
  return g/1000;
}
function pcWeightKg(lines){const kg=pcProductKg(lines);return kg+partnerPackingKg(kg);}

/* ─── EDIT ORDER ─── */
function pcEditStart(id){
  const o=pcOrder(id);
  PC.edit={id,lines:JSON.parse(JSON.stringify(o.items||[])),shipping:Number(o.shipping_fee),note:'',locked:o.stock_deducted};
  PC.assign=null;drawPC();
}
function pcEditHtml(o){
  const E=PC.edit,sub=E.lines.reduce((n,l)=>n+pc2(l.qty*l.unit_price),0);
  const sug=pcShipSuggest(o);
  const opts=S.skus.filter(s=>s.is_active).sort((a,b)=>(a.product_name+a.variant).localeCompare(b.product_name+b.variant)).map(s=>`<option value="${s.id}">${pcEsc(s.product_name)}${s.variant?' - '+pcEsc(s.variant):''}</option>`).join('');
  return (E.locked?'<div class="t-muted" style="font-size:12px;margin-bottom:8px">Stock already moved: only shipping and the invoice note can change.</div>':'')+
    E.lines.map((l,i)=>{const lb=pcLineLabel(l);
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:6px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
        <div style="flex:1;min-width:170px"><b>${pcEsc(lb.n)}</b> <span class="t-muted">${pcEsc(lb.s)}</span></div>
        <input class="inp" type="number" min="1" value="${l.qty}" style="width:70px;margin:0" ${E.locked?'disabled':''} onchange="pcLineQty(${i},this.value)" aria-label="Quantity">
        <input class="inp" type="number" min="0" step="0.01" value="${l.unit_price}" style="width:90px;margin:0" ${E.locked?'disabled':''} onchange="pcLinePrice(${i},this.value)" aria-label="Unit price">
        <b style="width:84px;text-align:right">${P(l.qty*l.unit_price)}</b>
        ${E.locked?'':`<button class="btn btn-o btn-sm" onclick="pcLineRemove(${i})">✕</button>`}</div>`;}).join('')+
    (E.locked?'':`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;align-items:center">
      <select class="inp" id="pe-sku" style="max-width:260px;margin:0"><option value="">Add a product...</option>${opts}</select>
      <button class="btn btn-o btn-sm" onclick="pcAddSku()">Add</button>
      <span class="t-muted" style="margin:0 4px">or</span>
      <input class="inp" id="pe-cname" placeholder="Custom item (e.g. Label design fee)" style="width:230px;margin:0">
      <input class="inp" id="pe-cqty" type="number" min="1" value="1" style="width:60px;margin:0">
      <input class="inp" id="pe-cprice" type="number" min="0" step="0.01" placeholder="Price" style="width:90px;margin:0">
      <button class="btn btn-o btn-sm" onclick="pcAddCustom()">Add custom</button></div>
      <div class="t-muted" style="font-size:11.5px;margin-bottom:8px">Prices follow the wholesale tiers automatically. Changing a price by hand keeps that price.</div>`)+
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <label style="font-size:13px">Shipping fee</label><input class="inp" id="pe-ship" type="number" min="0" step="0.01" value="${E.shipping}" style="width:110px;margin:0" onchange="PC.edit.shipping=pc2(this.value)">
      ${sug.txt}</div>
     <div style="font-size:14px;margin:10px 0"><b>New total ${P(sub+Number(E.shipping))}</b> <span class="t-muted">(was ${P(o.total)})</span></div>
     <input class="inp" id="pe-note" placeholder="Note for the partner about this change (optional)" value="${pcEsc(E.note)}" oninput="PC.edit.note=this.value">
     <div style="display:flex;gap:8px"><button class="btn btn-p btn-sm" onclick="pcEditSave()">Save and send revised invoice</button><button class="btn btn-o btn-sm" onclick="PC.edit=null;drawPC()">Cancel</button></div>`;
}
function pcShipSuggest(o){
  const E=PC.edit;
  if(o.courier==='lbc'){
    const kg=pcProductKg(E.lines),f=getLbcRate(kg);
    return {txt:f==null?'<span class="t-muted" style="font-size:12px">LBC order over 19 kg: type the LBC fee.</span>':`<span class="t-muted" style="font-size:12px">LBC for ${pc2(kg)} kg (no packing add-on): <b>${P(f)}</b></span> <button class="btn btn-o btn-sm" onclick="PC.edit.shipping=${f};drawPC()">Use</button>`};
  }
  if(!o.region_id)return {txt:''};
  const fee=getShippingRate(o.region_id,pcWeightKg(E.lines));
  return {txt:fee==null?'':`<span class="t-muted" style="font-size:12px">Suggested for ${pc2(pcWeightKg(E.lines))} kg: <b>${P(fee)}</b></span> <button class="btn btn-o btn-sm" onclick="PC.edit.shipping=${fee};drawPC()">Use</button>`};
}
function pcLineQty(i,v){const l=PC.edit.lines[i];l.qty=Math.max(1,parseInt(v,10)||1);pcReprice(PC.edit.lines);drawPC();}
function pcLinePrice(i,v){const l=PC.edit.lines[i];l.unit_price=pc2(v);l.manual=true;drawPC();}
function pcLineRemove(i){PC.edit.lines.splice(i,1);pcReprice(PC.edit.lines);drawPC();}
function pcAddSku(){
  const id=$('pe-sku').value;if(!id)return;const s=pcSku(id);
  const ex=PC.edit.lines.find(l=>l.kind==='product'&&l.sku_id===id);
  if(ex)ex.qty+=1;else PC.edit.lines.push({kind:'product',sku_id:id,name:s.product_name,variant:s.variant,qty:1,unit_price:0,weight_g:Number(s.weight_g)||0});
  pcReprice(PC.edit.lines);drawPC();
}
function pcAddCustom(){
  const name=$('pe-cname').value.trim(),qty=Math.max(1,parseInt($('pe-cqty').value,10)||1),price=pc2($('pe-cprice').value);
  if(!name){toast('Type a name for the custom item.');return;}
  PC.edit.lines.push({kind:'custom',name,variant:null,qty,unit_price:price,manual:true});drawPC();
}
async function pcEditSave(){
  const E=PC.edit,o=pcOrder(E.id);
  if(!E.lines.length){toast('An order needs at least one item.');return;}
  const items=E.lines.map(l=>({...l,line_total:pc2(l.qty*l.unit_price)}));
  try{
    await sbUpdate('mcc_partner_orders',o.id,{items,shipping_fee:pc2(E.shipping),revision_note:(E.note||'').trim()||null});
    PC.edit=null;await pcRefresh();toast('✓ Saved. The partner sees the revised invoice.');
    await pcTryDeduct(o.id);
  }catch(e){toast('Could not save: '+e.message);}
}

/* ─── CHOOSE VARIANTS (assorted lines and sets) ─── */
function pcAssignOpen(oid,idx,pn){
  const o=pcOrder(oid),l=o.items[idx];
  const need=l.kind==='set'?(l.contents.find(c=>c.product_name===pn).qty*l.qty):l.qty;
  const vars=S.skus.filter(s=>s.product_name===pn&&s.is_active);
  const cur={};
  if(l.kind==='set')(l.assigned||[]).filter(a=>a.product_name===pn).forEach(a=>cur[a.sku_id]=a.qty);
  PC.assign={id:oid,idx,pn,need,qty:cur,vars};drawPC();
}
function pcAssignSplit(onlyStock){
  const A=PC.assign,vs=onlyStock?A.vars.filter(v=>v.current_stock>0):A.vars;
  A.qty={};if(!vs.length)return drawPC();
  const base=Math.floor(A.need/vs.length),rem=A.need%vs.length;
  vs.forEach((v,i)=>A.qty[v.id]=base+(i<rem?1:0));drawPC();
}
function pcAssignQty(id,v){PC.assign.qty[id]=Math.max(0,parseInt(v,10)||0);const c=$('pa-count');if(c)c.innerHTML=pcAssignCount();}
function pcAssignCount(){
  const A=PC.assign,got=Object.values(A.qty).reduce((n,x)=>n+x,0),left=A.need-got;
  return left===0?`<span style="color:var(--success)">All ${A.need} assigned ✓</span>`:`<span style="color:var(--danger)">${left>0?left+' more to assign':-left+' too many'} (${got} of ${A.need})</span>`;
}
function pcAssignHtml(o){
  const A=PC.assign;
  return `<div style="font-size:13px;margin-bottom:8px">${pcEsc(A.pn)}: assign <b>${A.need}</b> pieces. Use up what is already made first.</div>`+
    A.vars.map(v=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
      <span>${pcEsc(v.variant||v.product_name)} <span class="t-muted">(${v.current_stock} in stock)</span></span>
      <input class="inp" type="number" min="0" value="${A.qty[v.id]||0}" style="width:80px;margin:0" oninput="pcAssignQty('${v.id}',this.value)"></div>`).join('')+
    `<div id="pa-count" style="margin:10px 0;font-size:13px;font-weight:600">${pcAssignCount()}</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-o btn-sm" onclick="pcAssignSplit(false)">Split evenly across all</button>
       <button class="btn btn-o btn-sm" onclick="pcAssignSplit(true)">Split evenly across those in stock</button>
       <button class="btn btn-p btn-sm" onclick="pcAssignSave()">Save</button><button class="btn btn-o btn-sm" onclick="PC.assign=null;drawPC()">Cancel</button></div>`;
}
async function pcAssignSave(){
  const A=PC.assign,o=pcOrder(A.id),items=JSON.parse(JSON.stringify(o.items)),l=items[A.idx];
  const got=Object.values(A.qty).reduce((n,x)=>n+x,0);
  if(got!==A.need){toast('The numbers must add up to '+A.need+'.');return;}
  const picks=A.vars.filter(v=>A.qty[v.id]>0);
  if(l.kind==='assorted'){
    const repl=picks.map(v=>({kind:'product',sku_id:v.id,name:v.product_name,variant:v.variant,qty:A.qty[v.id],unit_price:l.unit_price,weight_g:Number(v.weight_g)||0,line_total:pc2(A.qty[v.id]*l.unit_price)}));
    items.splice(A.idx,1,...repl);
  }else{
    l.assigned=(l.assigned||[]).filter(a=>a.product_name!==A.pn).concat(picks.map(v=>({sku_id:v.id,product_name:A.pn,qty:A.qty[v.id]})));
  }
  try{
    await sbUpdate('mcc_partner_orders',o.id,{items});
    PC.assign=null;await pcRefresh();toast('✓ Variants saved');await pcTryDeduct(o.id);
  }catch(e){toast('Could not save: '+e.message);}
}

/* ─── STOCK AND SALE (when paid AND every variant is chosen) ─── */
function pcStockItems(o){
  const out=[];
  (o.items||[]).forEach(i=>{
    if(i.kind==='product'&&i.sku_id)out.push({sku_id:i.sku_id,qty:i.qty,unit_price:Number(i.unit_price)});
    if(i.kind==='set'){
      const pcs=(i.assigned||[]).reduce((n,a)=>n+a.qty,0)||1,each=pc2(i.unit_price*i.qty/pcs);
      (i.assigned||[]).forEach(a=>out.push({sku_id:a.sku_id,qty:a.qty,unit_price:each}));
    }
  });
  return out;
}
PC.dedErr={};
async function pcTryDeduct(oid){
  const [o]=await sbGet('mcc_partner_orders',`id=eq.${oid}&select=*`);
  if(!o||o.is_cancelled||o.stock_deducted||o.pay_status!=='paid'||!o.variants_assigned)return;
  const items=pcStockItems(o);
  try{
    const skuIds=[...new Set(items.map(i=>i.sku_id))];
    const rows=skuIds.length?await sbGet('skus',`id=in.(${skuIds.join(',')})&select=id,unit_cost`):[];
    const cost={};rows.forEach(r=>cost[r.id]=parseFloat(r.unit_cost)||0);
    const productCost=items.reduce((n,i)=>n+(cost[i.sku_id]||0)*i.qty,0);
    const lastPay=PC.payments.filter(p=>p.order_id===o.id&&p.status==='verified').slice(-1)[0];
    const [sale]=await sbInsert('sales',{order_id:o.order_code,platform:'hotel',sale_date:todayPH(),customer_name:o.business_name,
      city_province:o.region_label,address:o.address,payment_method:lastPay?PC_METHODS[lastPay.method]||lastPay.method:null,subtotal:o.subtotal,platform_fee:0,
      shipping_fee:o.shipping_fee,total_amount:o.total,net_profit:o.total-productCost-(parseFloat(o.shipping_fee)||0),source:'Partner order',notes:o.notes||null});
    try{
      if(items.length)await sbInsert('sale_items',items.map(i=>({sale_id:sale.id,sku_id:i.sku_id,quantity:i.qty,unit_price:i.unit_price,subtotal:pc2(i.unit_price*i.qty)})));
      if(items.length)await sbRpc('deduct_member_order_stock',{p_sale_id:sale.id,p_items:items.map(i=>({sku_id:i.sku_id,quantity:i.qty})),p_stock_date:todayPH(),p_created_by:CURRENT_USER.id});
    }catch(e){await sbDelete('sale_items',`sale_id=eq.${sale.id}`);await sbDelete('sales',`id=eq.${sale.id}`);throw e;}
    await sbUpdate('mcc_partner_orders',o.id,{stock_deducted:true,sale_id:sale.id});
    salesCache=null;await initInventoryData();await pcRefresh();
    delete PC.dedErr[oid];toast('✓ Paid and variants chosen: sale recorded and stock updated');
  }catch(e){PC.dedErr[oid]=e.message||String(e);drawPC();alert('The sale could not be recorded yet.\n\n'+PC.dedErr[oid]+'\n\nFix the stock in Inventory, then tap "Record sale and update stock" on the order.');}
}

/* ─── DELIVERY ─── */
function pcDeliveryHtml(o){
  return `<div style="font-size:13px;line-height:1.6">${pcEsc(o.recipient_name)}${o.contact_number?', '+pcEsc(o.contact_number):''}<br>${pcEsc(o.address)}<br><span class="t-muted">${pcEsc(o.region_label)} · ${o.courier==='lbc'?'LBC':'SPX / J&T'}</span></div>
    <button class="btn btn-o btn-sm" style="margin-top:8px" onclick="PC.delivery='${o.id}';drawPC()">Edit delivery details</button>`;
}
function pcDeliveryEditHtml(o){
  const f=(id,l,v)=>`<label class="lbl">${l}</label><input class="inp" id="pd-${id}" value="${pcEsc(v)}">`;
  return f('name','Recipient',o.recipient_name)+f('phone','Contact number',o.contact_number)+
    `<label class="lbl">Address</label><textarea class="inp" id="pd-addr" rows="2">${pcEsc(o.address)}</textarea>
     <label class="lbl">Region</label><select class="inp" id="pd-region">${SHIPPING_RATES.map(r=>`<option value="${r.id}" ${r.id===o.region_id?'selected':''}>${pcEsc(r.label)}</option>`).join('')}</select>
     <label class="lbl">Courier</label><select class="inp" id="pd-courier"><option value="spx" ${o.courier!=='lbc'?'selected':''}>SPX / J&amp;T</option><option value="lbc" ${o.courier==='lbc'?'selected':''}>LBC</option></select>
     <div style="display:flex;gap:8px"><button class="btn btn-p btn-sm" onclick="pcDeliverySave('${o.id}')">Save</button><button class="btn btn-o btn-sm" onclick="PC.delivery=null;drawPC()">Cancel</button></div>
     <div class="t-muted" style="font-size:12px;margin-top:6px">If the region or courier changes the shipping fee, use "Edit order" to update the invoice.</div>`;
}
async function pcDeliverySave(id){
  const rid=$('pd-region').value;
  try{
    await sbUpdate('mcc_partner_orders',id,{recipient_name:$('pd-name').value.trim(),contact_number:$('pd-phone').value.trim(),address:$('pd-addr').value.trim(),
      region_id:rid,region_label:(SHIPPING_RATES.find(r=>r.id===rid)||{}).label||'',courier:$('pd-courier').value});
    PC.delivery=null;await pcRefresh();toast('✓ Delivery details saved');
  }catch(e){toast('Could not save: '+e.message);}
}

/* ─── PROGRESS AND TRACKING ─── */
function pcStageHtml(o){
  const cur=Math.max(0,PC_STAGES.findIndex(s=>s.id===o.current_stage)),next=PC_STAGES[cur+1],d=o.stage_dates||{};
  const dots=PC_STAGES.map((s,i)=>`<span style="display:inline-block;margin:0 10px 6px 0;font-size:12.5px;color:${i<=cur?'var(--lagoon)':'var(--text-muted)'};font-weight:${i===cur?700:400}">${i<=cur?'✓':'○'} ${s.label}${d[s.id]&&i<=cur?' <span class="t-muted">'+fmtDate(d[s.id])+'</span>':''}</span>`).join('');
  let act='';
  if(o.is_cancelled)act='';
  else if(o.pay_status!=='paid')act='<div class="t-muted" style="font-size:12.5px">Tracking steps open once every payment is confirmed.</div>';
  else if(!o.variants_assigned)act='<div class="t-muted" style="font-size:12.5px">Choose the variants for the assorted items first.</div>';
  else if(next&&next.id==='shipped')act=pcTrkForm(o,o.courier||'spx','','','Mark as shipped','pcShip');
  else if(next)act=`<button class="btn btn-p btn-sm" onclick="pcStage('${o.id}','${next.id}')">Mark: ${next.label}</button>`;
  return dots+`<div style="margin-top:6px">${act}${cur>1&&!o.is_cancelled?` <button class="btn btn-o btn-sm" onclick="pcStageBack('${o.id}')">Undo last step</button>`:''}</div>`+
    (o.tracking?`<div class="t-muted" style="font-size:12.5px;margin-top:6px">Tracking: ${pcEsc((o.tracking.type||'').toUpperCase())} <b>${pcEsc(o.tracking.number||'')}</b> ${(()=>{const u=courierTrackUrl(o.tracking.type||o.courier,o.tracking.link);return u?'<a href="'+pcEsc(u)+'" target="_blank" rel="noopener">tracking link</a>':'';})()}
      ${o.current_stage==='shipped'&&!o.is_cancelled?`<button class="btn btn-o btn-sm" style="margin-left:6px" onclick="pcEditTrk('${o.id}')">Edit tracking</button>`:''}</div><div id="pc-trk-${o.id}"></div>`:'');
}
/* Tracking form: courier, tracking number (required for every courier). J&T and LBC links are added automatically;
   SPX needs the link for that parcel pasted in. */
function pcTrkForm(o,type,num,link,btn,fn){
  const id=o.id,q=v=>pcEsc(v||'');
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
    <div><label class="lbl" style="margin:0 0 3px">Courier</label><select class="inp" id="ps-type-${id}" style="width:110px;margin:0" onchange="pcTrkType('${id}')">${['spx','jnt','lbc'].map(k=>`<option value="${k}" ${type===k?'selected':''}>${COURIER_TRACK[k].name}</option>`).join('')}</select></div>
    <div style="flex:1;min-width:170px"><label class="lbl" style="margin:0 0 3px">Tracking number <span style="color:var(--danger)">*</span></label><input class="inp" id="ps-num-${id}" placeholder="Tracking number" value="${q(num)}" style="margin:0"></div>
    <div id="ps-linkwrap-${id}" style="flex:1.4;min-width:200px;${type==='spx'?'':'display:none'}"><label class="lbl" style="margin:0 0 3px">SPX tracking link <span style="color:var(--danger)">*</span></label><input class="inp" id="ps-link-${id}" placeholder="https://..." value="${q(link)}" style="margin:0"></div>
    <div id="ps-auto-${id}" class="t-muted" style="font-size:12.5px;flex:1.4;min-width:200px;${type==='spx'?'display:none':''}">${type==='lbc'?'LBC':'J&amp;T'} tracking link is added automatically.</div>
    <button class="btn btn-p btn-sm" onclick="${fn}('${id}')">${btn}</button></div>`;
}
function pcTrkType(id){
  const t=$('ps-type-'+id).value;
  $('ps-linkwrap-'+id).style.display=t==='spx'?'':'none';
  const a=$('ps-auto-'+id);a.style.display=t==='spx'?'none':'';a.innerHTML=(t==='lbc'?'LBC':'J&amp;T')+' tracking link is added automatically.';
}
function pcEditTrk(id){
  const o=pcOrder(id),t=o.tracking||{};
  $('pc-trk-'+id).innerHTML=`<div style="margin-top:8px">${pcTrkForm(o,t.type||o.courier||'spx',t.number||'',t.link||'','Save tracking','pcSaveTrk')}</div>`;
}
function pcReadTrk(id){
  const type=$('ps-type-'+id).value,num=$('ps-num-'+id).value.trim();let link=type==='spx'?$('ps-link-'+id).value.trim():'';
  if(!num){toast('Enter the tracking number.');return null;}
  if(type==='spx'){
    if(!link){toast('Paste the SPX tracking link for this parcel.');return null;}
    if(!/^https?:\/\//i.test(link)&&/^www\./i.test(link))link='https://'+link;
    if(!/^https?:\/\/\S+\.\S+/i.test(link)){toast('The SPX tracking link must start with https://');return null;}
  }else link=COURIER_TRACK[type].page;
  return {type,number:num,link};
}
async function pcSaveTrk(id){
  const tr=pcReadTrk(id);if(!tr)return;
  try{await sbUpdate('mcc_partner_orders',id,{tracking:tr});await pcRefresh();toast('✓ Tracking saved. The partner sees it right away.');}catch(e){toast('Could not update: '+e.message);}
}
function pcStamp(o,stage){return {...(o.stage_dates||{}),[stage]:new Date().toISOString()};}
async function pcStage(id,stage){
  const o=pcOrder(id);
  try{await sbUpdate('mcc_partner_orders',id,{current_stage:stage,stage_dates:pcStamp(o,stage)});await pcRefresh();toast('✓ Updated');}catch(e){toast('Could not update: '+e.message);}
}
async function pcShip(id){
  const o=pcOrder(id),tr=pcReadTrk(id);if(!tr)return;
  try{await sbUpdate('mcc_partner_orders',id,{current_stage:'shipped',stage_dates:pcStamp(o,'shipped'),tracking:tr});await pcRefresh();toast('✓ Marked as shipped');}catch(e){toast('Could not update: '+e.message);}
}
async function pcStageBack(id){
  const o=pcOrder(id),i=PC_STAGES.findIndex(s=>s.id===o.current_stage);if(i<2)return;
  const d={...(o.stage_dates||{})};delete d[o.current_stage];
  try{await sbUpdate('mcc_partner_orders',id,{current_stage:PC_STAGES[i-1].id,stage_dates:d,tracking:o.current_stage==='shipped'?null:o.tracking});await pcRefresh();}catch(e){toast('Could not update: '+e.message);}
}

/* ─── CANCEL ─── */
async function pcCancel(id){
  const o=pcOrder(id);
  let msg='Cancel order '+o.order_code+' from '+o.business_name+'?';
  if(o.stock_deducted)msg+='\n\nStock already moved, so the sale will be removed and the items go back to stock as a return. (A bar already cut into samplers stays cut.)';
  if(!confirm(msg))return;
  try{
    if(o.stock_deducted){
      const items=pcStockItems(o);
      if(items.length)await sbRpc('return_member_order_stock',{p_items:items.map(i=>({sku_id:i.sku_id,quantity:i.qty})),p_notes:'Partner order cancelled: '+o.order_code,p_stock_date:todayPH(),p_created_by:CURRENT_USER.id});
      if(o.sale_id){await sbDelete('sale_items',`sale_id=eq.${o.sale_id}`);await sbDelete('sales',`id=eq.${o.sale_id}`);}
      salesCache=null;await initInventoryData();
    }
    await sbUpdate('mcc_partner_orders',id,{is_cancelled:true,stock_deducted:false,sale_id:null});
    await pcRefresh();toast('Order cancelled');
  }catch(e){toast('Could not cancel: '+e.message);}
}

/* ─── PARTNERS LIST ─── */
function pcPartnersHtml(){
  if(!PC.partners.length)return '<div class="empty"><div class="empty-i">🤝</div><p>No partners yet.</p></div>';
  const sorted=PC.partners.slice().sort((a,b)=>(a.is_approved===b.is_approved?0:a.is_approved?1:-1));
  return sorted.map(p=>{
    const os=PC.orders.filter(o=>o.partner_id===p.id&&!o.is_cancelled),owed=os.reduce((n,o)=>n+Math.max(0,o.total-o.amount_paid),0);
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><div style="font-weight:600">${pcEsc(p.business_name)} ${p.is_approved?'':pcPill('Waiting for approval','#FFE8E0','#B0452A')} ${p.is_active?'':pcPill('Paused','#eee','#555')}</div>
        <div class="t-muted" style="font-size:12px">${[p.is_hotel?'Hotel':'',p.is_retail?'Retail':''].filter(Boolean).join(' + ')} · ${pcEsc(p.contact_name||'')} ${pcEsc(p.contact_number||'')} · joined ${fmtDate(p.created_at)}</div>
        <div class="t-muted" style="font-size:12px">${os.length} order${os.length===1?'':'s'}${owed>0?' · owes '+P(owed):''}</div></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${p.is_approved?'':`<button class="btn btn-p btn-sm" onclick="pcApprove('${p.id}')">✓ Approve</button>`}
        <button class="btn btn-o btn-sm" onclick="pcViewAs('${p.id}')">👁 View as partner</button>
        <button class="btn btn-o btn-sm" onclick="pcToggleActive('${p.id}')">${p.is_active?'Pause account':'Reactivate'}</button></div></div></div>`;}).join('');
}
async function pcApprove(id){
  const p=pcPartner(id);
  if(!confirm('Approve '+p.business_name+'? They can then shop and place orders.'))return;
  try{await sbUpdate('mcc_partners',id,{is_approved:true});await pcRefresh();toast('✓ Approved. They can now open their dashboard.');}catch(e){toast('Could not approve: '+e.message);}
}
async function pcToggleActive(id){
  const p=pcPartner(id);
  if(p.is_active&&!confirm('Pause '+p.business_name+'? They will not be able to order until you reactivate.'))return;
  try{await sbUpdate('mcc_partners',id,{is_active:!p.is_active});await pcRefresh();}catch(e){toast('Could not update: '+e.message);}
}

/* Red number on the tab: orders needing a payment check or variants. Light check once a minute. */
async function pcBadgeRefresh(){
  try{
    const [orders,payments,pending]=await Promise.all([
      sbGet('mcc_partner_orders','select=id,is_cancelled,variants_assigned&is_cancelled=eq.false'),
      sbGet('mcc_partner_payments','select=order_id&status=eq.submitted'),
      sbGet('mcc_partners','select=id&is_approved=eq.false')]);
    const pay=new Set(payments.map(p=>p.order_id));
    const n=orders.filter(o=>pay.has(o.id)||!o.variants_assigned).length+pending.length, b=$('partners-badge');
    if(b){b.textContent=n;b.style.display=n?'inline-block':'none';}
  }catch(e){/* quiet */}
}
function pcStartBadge(){
  pcBadgeRefresh();
  if(PC.timer)clearInterval(PC.timer);
  PC.timer=setInterval(()=>{if(!document.hidden)pcBadgeRefresh();},60000);
}

/* Opens the partner's own dashboard in a new tab, read only, using this admin login */
function pcViewAs(id){window.open('/partner-portal?viewas='+encodeURIComponent(id),'_blank');}
