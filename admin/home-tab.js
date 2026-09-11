/* ─────────────────────────────────────────────────────────
   HOME TAB
   renderHome() + Create Partner Account modal (invoked from the Home tab).
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   HOME TAB
   ═══════════════════════════════════════════════════════════════════════ */
async function renderHome(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading overview...</p></div>`;
  try{
    const sales=await fetchSalesData();
    const now=new Date();
    const wkStart=startOfWeek(now), moStart=startOfMonth(now);

    const inWeek=sales.filter(s=>new Date(s.sale_date)>=wkStart);
    const inMonth=sales.filter(s=>new Date(s.sale_date)>=moStart);

    const grossWeek=inWeek.reduce((s,x)=>s+parseFloat(x.total_amount||0),0);
    const grossMonth=inMonth.reduce((s,x)=>s+parseFloat(x.total_amount||0),0);
    const lowStockItems=S.skus.filter(s=>s.current_stock<=s.low_stock_threshold);

    function topMovers(salesList){
      const map={};
      salesList.forEach(sale=>{
        (sale.sale_items||[]).forEach(item=>{
          const key=item.sku_id;
          if(!map[key])map[key]={label:(item.skus?item.skus.product_name:'Unknown')+(item.skus&&item.skus.variant?' — '+item.skus.variant:''),qty:0};
          map[key].qty+=item.quantity;
        });
      });
      return Object.values(map).sort((a,b)=>b.qty-a.qty).slice(0,5);
    }
    const moversWeek=topMovers(inWeek), moversMonth=topMovers(inMonth);

    function moverListHtml(list){
      if(!list.length)return `<p class="t-muted" style="font-size:13px">No sales in this period yet.</p>`;
      return list.map((m,i)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
        <span>${i+1}. ${m.label}</span><span style="font-weight:600;color:var(--lagoon)">${m.qty} sold</span></div>`).join('');
    }

    $('body').innerHTML=`
    <div class="stat-strip">
      <div class="stat-box"><div class="stat-num">${P(grossWeek)}</div><div class="stat-lbl">Gross Sales — This Week</div></div>
      <div class="stat-box"><div class="stat-num">${P(grossMonth)}</div><div class="stat-lbl">Gross Sales — This Month</div></div>
      <div class="stat-box ${lowStockItems.length?'warn':''}"><div class="stat-num">${lowStockItems.length}</div><div class="stat-lbl">Low Stock Items</div></div>
      <div class="stat-box"><div class="stat-num">${inMonth.length}</div><div class="stat-lbl">Sales — This Month</div></div>
    </div>
    <div class="card">
      <div class="card-title">🤝 Partners</div>
      <p class="t-muted" style="font-size:13px;margin-bottom:12px">Give a vetted hotel or retail partner their own login.</p>
      <button class="btn btn-p btn-sm" onclick="openPartnerModal()">+ Create Partner Account</button>
    </div>
    <div class="card">
      <div class="card-title">🔥 Top 5 Fastest-Moving — This Week</div>
      ${moverListHtml(moversWeek)}
    </div>
    <div class="card">
      <div class="card-title">🔥 Top 5 Fastest-Moving — This Month</div>
      ${moverListHtml(moversMonth)}
    </div>
    ${lowStockItems.length?`<div class="card">
      <div class="card-title" style="color:var(--danger)">⚠️ Low Stock</div>
      ${lowStockItems.map(s=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--sand-light);font-size:13px">
        <span>${s.product_name}${s.variant?' — '+s.variant:''}</span><span class="stock-low">${s.current_stock} left</span></div>`).join('')}
    </div>`:''}
    <p class="t-muted" style="font-size:11px;text-align:center;margin-top:8px">Hotel orders aren't wired into this project's reports yet — this reflects direct/storefront sales only.</p>`;
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load overview.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CREATE PARTNER ACCOUNT
   ═══════════════════════════════════════════════════════════════════════ */
function openPartnerModal(){
  $('partner-role').value='hotel';
  $('partner-bizname').value='';
  $('partner-email').value='';
  $('partner-pw').value='';
  $('partner-err').style.display='none';
  openModal('partner-modal');
}
function generatePartnerPw(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw='';
  for(let i=0;i<10;i++)pw+=chars[Math.floor(Math.random()*chars.length)];
  $('partner-pw').value=pw;
}
async function submitPartnerAccount(){
  const role=$('partner-role').value;
  const bizName=$('partner-bizname').value.trim();
  const email=$('partner-email').value.trim();
  const pw=$('partner-pw').value;
  const errBox=$('partner-err');
  errBox.style.display='none';
  if(!bizName||!email||!pw){errBox.textContent='All fields are required.';errBox.style.display='block';return;}
  if(pw.length<8){errBox.textContent='Password must be at least 8 characters.';errBox.style.display='block';return;}

  const btn=$('partner-submit');btn.textContent='Creating...';btn.disabled=true;
  try{
    const r=await fetch('/api/create-partner-account',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({adminAccessToken:ACCESS_TOKEN, email, password:pw, role, businessName:bizName})
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Failed to create account');
    toast('✓ Account created! Share the email + password with them directly.');
    closeModal('partner-modal');
  }catch(e){
    errBox.textContent=e.message;errBox.style.display='block';
  }finally{
    btn.textContent='Create Account';btn.disabled=false;
  }
}
