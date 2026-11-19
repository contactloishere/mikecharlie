/* ─────────────────────────────────────────────────────────
   INVENTORY MOVEMENT SHEET
   Rows = every product, columns = days of the month.
   Data comes from the database function inventory_movement_month(year, month).
   ───────────────────────────────────────────────────────── */
const MV={view:'list',year:null,month:null,data:null,loading:false,search:'',cat:'',movedOnly:false,err:''};
const MV_LABEL={restock:'New stock in',adjustment_other:'Correction / other',adjustment_return:'Return',adjustment_personal_use:'Personal use',adjustment_freebie:'Freebie',adjustment_damage:'Damaged',cut_finished_add:'Made (cut)',manual_cut_finished_add:'Made (cut)',cut_raw_deduct:'Used in cut',manual_cut_raw_deduct:'Used in cut',sale:'Sale'};
const MV_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

function invSubTabs(){
  const on=v=>MV.view===v?'btn-p':'btn-o';
  return `<div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn ${on('list')} btn-sm" onclick="setInvView('list')">Stock List</button>
    <button class="btn ${on('move')} btn-sm" onclick="setInvView('move')">Inventory Movement</button>
  </div>`;
}
function setInvView(v){MV.view=v;if(v==='move'){MV.year=null;}renderInventory();}

function mvDaysIn(y,m){return new Date(y,m,0).getDate();}
async function mvLoad(){
  if(MV.year===null){const t=todayPH().split('-');MV.year=+t[0];MV.month=+t[1];}
  MV.loading=true;MV.err='';renderMovement();
  try{
    MV.data=await sbRpc('inventory_movement_month',{p_year:MV.year,p_month:MV.month});
  }catch(e){MV.err=e.message;MV.data=null;}
  MV.loading=false;renderMovement();
}
function mvSet(k,v){MV[k]=v;if(k==='year'||k==='month'){mvLoad();}else renderMovement();}

function mvCompute(){
  const N=mvDaysIn(MV.year,MV.month);
  const start=(MV.data&&MV.data.start)||{};
  const byDay={};
  ((MV.data&&MV.data.days)||[]).forEach(r=>{(byDay[r.sku]=byDay[r.sku]||{})[r.d]=r;});
  const rows=S.skus.filter(s=>{
    if(MV.search){const q=MV.search.toLowerCase();if(!(s.product_name+' '+s.sku_code+' '+(s.variant||'')).toLowerCase().includes(q))return false;}
    if(MV.cat&&(!s.categories||s.categories.id!==MV.cat))return false;
    const days=byDay[s.id]||{};
    const st=+start[s.id]||0;
    if(!s.is_active&&!st&&!Object.keys(days).length&&!s.current_stock)return false;
    if(MV.movedOnly&&!Object.keys(days).length)return false;
    return true;
  }).map(s=>{
    const days=byDay[s.id]||{};let tin=0,tout=0,net=0;
    Object.values(days).forEach(r=>{tin+=+r.in;tout+=+r.out;net+=+r.net;});
    const st=+start[s.id]||0;
    return {s,days,st,tin,tout,fin:st+net};
  }).sort((a,b)=>(a.s.product_name+(a.s.variant||'')).localeCompare(b.s.product_name+(b.s.variant||'')));
  return {N,rows};
}

function renderMovement(){
  if(MV.year===null){mvLoad();return;}
  const {N,rows}=mvCompute();
  const today=todayPH(),tp=today.split('-').map(Number);
  const isCur=tp[0]===MV.year&&tp[1]===MV.month;
  const isFuture=(MV.year>tp[0])||(MV.year===tp[0]&&MV.month>tp[1]);
  const years=[];for(let y=tp[0]-3;y<=tp[0]+1;y++)years.push(y);
  let html=invSubTabs()+`<div class="card"><div class="toolbar">
    <label class="lbl" style="margin:0">Year</label>
    <select class="inp" onchange="mvSet('year',+this.value)">${years.map(y=>`<option ${y===MV.year?'selected':''}>${y}</option>`).join('')}</select>
    <label class="lbl" style="margin:0">Month</label>
    <select class="inp" onchange="mvSet('month',+this.value)">${MV_MONTHS.map((m,i)=>`<option value="${i+1}" ${i+1===MV.month?'selected':''}>${m}</option>`).join('')}</select>
    <input class="inp" placeholder="Search product..." value="${attrEsc(MV.search)}" oninput="MV.search=this.value;renderMovement()">
    <select class="inp" onchange="mvSet('cat',this.value)"><option value="">All Categories</option>${S.categories.map(c=>`<option value="${c.id}" ${MV.cat===c.id?'selected':''}>${c.name}</option>`).join('')}</select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-mid)"><input type="checkbox" ${MV.movedOnly?'checked':''} onchange="mvSet('movedOnly',this.checked)"> Only items that moved</label>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-p btn-sm" onclick="mvOpenRecord()">+ Record movement</button>
    <button class="btn btn-o btn-sm" onclick="mvDownload()">⬇ Download for Excel</button>
  </div>
  <p class="t-muted" style="font-size:12px;margin:10px 0 0">Each cell is the net change for that day. Tap a cell to see exactly what happened. Final = next month's starting count.</p></div>`;
  if(MV.err)html+=`<div class="empty"><p>Could not load: ${MV.err}</p></div>`;
  else if(MV.loading||!MV.data)html+=`<div class="empty"><p>Loading...</p></div>`;
  else if(!rows.length)html+=`<div class="empty"><div class="empty-i">📦</div><p>No products match.</p></div>`;
  else{
    const cs='padding:6px 8px;text-align:center;min-width:38px;font-size:12px;';
    html+=`<div class="table-wrap" style="max-height:70vh;overflow:auto"><table id="mv-table" style="border-collapse:separate;border-spacing:0"><thead><tr>
      <th class="frz c1" style="top:0;z-index:5">Product</th><th class="frz c2" style="top:0;z-index:5">Start</th>`;
    for(let d=1;d<=N;d++){
      const ds=`${MV.year}-${String(MV.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      html+=`<th style="${cs}position:sticky;top:0;background:${ds===today?'#FFF3C4':'var(--pearl)'};z-index:2">${d}</th>`;
    }
    html+=`<th style="${cs}position:sticky;top:0;background:var(--pearl);z-index:2">In</th><th style="${cs}position:sticky;top:0;background:var(--pearl);z-index:2">Out</th><th style="${cs}position:sticky;top:0;background:var(--pearl);z-index:2">Final</th></tr></thead><tbody>`;
    rows.forEach(r=>{
      const flag=isCur&&r.fin!==r.s.current_stock;
      html+=`<tr><td class="frz c1"><strong style="font-size:12px">${r.s.product_name}</strong>${r.s.variant?`<br><span class="t-muted" style="font-size:11px">${r.s.variant}</span>`:''}</td><td class="frz c2" style="box-shadow:2px 0 6px rgba(0,0,0,.05)">${r.st}</td>`;
      for(let d=1;d<=N;d++){
        const ds=`${MV.year}-${String(MV.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const fut=ds>today,c=r.days[d];
        let inner='',style=cs+(fut?'background:#F6F4F0;':ds===today?'background:#FFFBE6;':'');
        if(c){
          const n=+c.net;
          inner=n>0?`<span style="color:#1F7A3E;font-weight:600">+${n}</span>`:n<0?`<span style="color:#B3261E;font-weight:600">${n}</span>`:`<span class="t-muted">0</span>`;
          style+='cursor:pointer;';
          html+=`<td style="${style}" onclick="mvShowCell('${r.s.id}',${d})" title="${c.n} entr${c.n==1?'y':'ies'}">${inner}${c.n>1?'<sup style="font-size:9px;color:var(--text-mid)">'+c.n+'</sup>':''}</td>`;
        }else html+=`<td style="${style}"></td>`;
      }
      html+=`<td style="${cs}color:#1F7A3E">${r.tin?'+'+r.tin:''}</td><td style="${cs}color:#B3261E">${r.tout?'-'+Math.abs(r.tout):''}</td>
        <td style="${cs}font-weight:700" title="${flag?'Does not match the Stock List ('+r.s.current_stock+')':''}">${r.fin}${flag?' <span style="color:#B3261E">⚠</span>':''}</td></tr>`;
    });
    html+=`</tbody></table></div>`;
  }
  $('body').innerHTML=html;
}

/* Tap a cell: show that day's entries */
async function mvShowCell(skuId,d){
  const s=S.skus.find(x=>x.id===skuId);
  const ds=`${MV.year}-${String(MV.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  let rows;
  try{rows=await sbGet('inventory_transactions',`sku_id=eq.${skuId}&stock_date=eq.${ds}&select=id,txn_type,quantity_change,notes,created_at&order=created_at.asc`);}
  catch(e){toast('Error: '+e.message);return;}
  const manual=['restock','adjustment_other','adjustment_return','adjustment_personal_use','adjustment_freebie','adjustment_damage'];
  let m=$('mv-modal');
  if(!m){m=document.createElement('div');m.id='mv-modal';m.className='modal';document.body.appendChild(m);}
  m.innerHTML=`<div class="modal-box" style="max-width:520px"><h3 style="margin:0 0 4px">${s.product_name}${s.variant?' ('+s.variant+')':''}</h3>
    <p class="t-muted" style="margin:0 0 12px;font-size:13px">${fmtDay(ds)}</p>
    <table style="width:100%"><thead><tr><th>Type</th><th>Qty</th><th>Note</th><th></th></tr></thead><tbody>
    ${rows.map(x=>`<tr><td>${MV_LABEL[x.txn_type]||x.txn_type}</td><td style="font-weight:600;color:${x.quantity_change<0?'#B3261E':'#1F7A3E'}">${x.quantity_change>0?'+':''}${x.quantity_change}</td><td style="white-space:normal;font-size:12px">${attrEsc(x.notes||'')}</td>
      <td>${manual.includes(x.txn_type)?`<button class="btn btn-o btn-sm" onclick="mvUndo('${skuId}','${ds}','${x.txn_type}',${x.quantity_change})">Undo</button>`:''}</td></tr>`).join('')}
    </tbody></table>
    <p class="t-muted" style="font-size:11px;margin:10px 0">Undo adds an opposite entry on the same day, so the history stays honest.</p>
    <div style="text-align:right"><button class="btn btn-o" onclick="closeModal('mv-modal')">Close</button></div></div>`;
  openModal('mv-modal');
}
async function mvUndo(skuId,ds,type,qty){
  if(!confirm('Undo this entry? An opposite entry will be added on the same day.'))return;
  try{
    await sbRpc('apply_inventory_adjustment',{p_sku_id:skuId,p_txn_type:type,p_quantity_change:-qty,p_notes:'Undo of an earlier entry ('+(MV_LABEL[type]||type)+' '+(qty>0?'+':'')+qty+')',p_created_by:CURRENT_USER.id,p_stock_date:ds});
    toast('✓ Undone.');closeModal('mv-modal');await initInventoryData();mvLoad();
  }catch(e){toast('Error: '+e.message);}
}

/* + Record movement */
function mvOpenRecord(){
  let m=$('mvr-modal');
  if(!m){m=document.createElement('div');m.id='mvr-modal';m.className='modal';document.body.appendChild(m);}
  m.innerHTML=`<div class="modal-box" style="max-width:480px"><h3 style="margin:0 0 12px">Record movement</h3>
    <label class="lbl">Product</label><select class="inp" id="mvr-sku" style="width:100%">${S.skus.map(s=>`<option value="${s.id}">${s.sku_code} — ${s.product_name}${s.variant?' ('+s.variant+')':''} [${s.current_stock} in stock]</option>`).join('')}</select>
    <label class="lbl">Date</label><input class="inp" type="date" id="mvr-date" value="${todayPH()}" max="${todayPH()}">
    <label class="lbl">What happened</label><select class="inp" id="mvr-type" style="width:100%" onchange="mvTypeHint()">
      <option value="restock">New stock in (+)</option><option value="adjustment_return">Return (+)</option>
      <option value="adjustment_other">Correction: I counted (sets the number)</option>
      <option value="adjustment_damage">Damaged (-)</option><option value="adjustment_freebie">Freebie (-)</option>
      <option value="adjustment_personal_use">Personal use (-)</option></select>
    <label class="lbl" id="mvr-qlbl">Quantity</label><input class="inp" type="number" id="mvr-qty" min="0" style="width:100%">
    <label class="lbl">Note (optional)</label><input class="inp" id="mvr-notes" style="width:100%">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-o" onclick="closeModal('mvr-modal')">Cancel</button><button class="btn btn-p" onclick="mvSubmitRecord()">Save</button></div></div>`;
  openModal('mvr-modal');
}
function mvTypeHint(){$('mvr-qlbl').textContent=$('mvr-type').value==='adjustment_other'?'Counted number (what you actually have now)':'Quantity';}
async function mvSubmitRecord(){
  const skuId=$('mvr-sku').value,type=$('mvr-type').value,date=$('mvr-date').value||todayPH();
  const q=parseInt($('mvr-qty').value);
  if(isNaN(q)||q<0||(type!=='adjustment_other'&&q===0)){toast('Enter a quantity.');return;}
  if(date>todayPH()){toast('The date cannot be in the future.');return;}
  let change,notes=$('mvr-notes').value.trim();
  if(type==='adjustment_other'){
    try{
      const cur=(await sbGet('skus',`id=eq.${skuId}&select=current_stock`))[0].current_stock;
      change=q-cur;if(!change){toast('That matches the current count already.');return;}
      notes='Correction: count '+cur+' to '+q+(notes?' ('+notes+')':'');
    }catch(e){toast('Error: '+e.message);return;}
  }else change=['adjustment_damage','adjustment_freebie','adjustment_personal_use'].includes(type)?-q:q;
  try{
    await sbRpc('apply_inventory_adjustment',{p_sku_id:skuId,p_txn_type:type,p_quantity_change:change,p_notes:notes||null,p_created_by:CURRENT_USER.id,p_stock_date:date});
    toast('✓ Recorded, dated '+fmtDay(date)+'.');closeModal('mvr-modal');await initInventoryData();mvLoad();
  }catch(e){toast('Error: '+e.message);}
}

/* Download as CSV (opens in Excel) */
function mvDownload(){
  const {N,rows}=mvCompute();
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const head=['Product','Variant','SKU','Start'];for(let d=1;d<=N;d++)head.push(d);head.push('In','Out','Final');
  const out=[head.map(q).join(',')];
  rows.forEach(r=>{const l=[r.s.product_name,r.s.variant||'',r.s.sku_code,r.st];for(let d=1;d<=N;d++)l.push(r.days[d]?r.days[d].net:'');l.push(r.tin,r.tout,r.fin);out.push(l.map(q).join(','));});
  const blob=new Blob(['﻿'+out.join('\r\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`inventory-movement-${MV.year}-${String(MV.month).padStart(2,'0')}.csv`;a.click();
}
