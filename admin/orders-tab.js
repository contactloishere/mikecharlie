/* ─────────────────────────────────────────────────────────
   MEMBER ORDERS TAB
   Storefront orders (mcc_orders). Hotel orders are a separate build and
   intentionally NOT mixed in here.
   Uses helpers from shared.js: $, P, toast, sbGet, sbUpdate, fmtDate.
   ───────────────────────────────────────────────────────── */

const MO={orders:[],itemsByOrder:{},filter:'all'};

const MO_STAGE_LABEL={
  awaiting_payment_verification:'Awaiting Payment',
  payment_confirmed:'Payment Confirmed',
  preparing_order:'Preparing',
  shipped:'Shipped'
};

async function renderMemberOrders(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading member orders...</p></div>`;
  try{
    const orders=await sbGet('mcc_orders','select=*&order=created_at.desc');
    MO.orders=orders;
    MO.itemsByOrder={};
    if(orders.length){
      const ids=orders.map(o=>o.id).join(',');
      const items=await sbGet('mcc_order_items',`order_id=in.(${ids})&select=*`);
      items.forEach(it=>{(MO.itemsByOrder[it.order_id]=MO.itemsByOrder[it.order_id]||[]).push(it);});
    }
    drawMemberOrders();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load member orders.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}

function moCount(stage){return MO.orders.filter(o=>o.current_stage===stage).length;}

function setMoFilter(v){MO.filter=v;drawMemberOrders();}

function drawMemberOrders(){
  const list=MO.filter==='all'?MO.orders:MO.orders.filter(o=>o.current_stage===MO.filter);
  $('body').innerHTML=`
    <div class="stat-strip">
      <div class="stat-box ${moCount('awaiting_payment_verification')?'warn':''}"><div class="stat-num">${moCount('awaiting_payment_verification')}</div><div class="stat-lbl">Awaiting Payment</div></div>
      <div class="stat-box"><div class="stat-num">${moCount('payment_confirmed')}</div><div class="stat-lbl">Payment Confirmed</div></div>
      <div class="stat-box"><div class="stat-num">${moCount('preparing_order')}</div><div class="stat-lbl">Preparing</div></div>
      <div class="stat-box"><div class="stat-num">${moCount('shipped')}</div><div class="stat-lbl">Shipped</div></div>
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      <select class="inp" onchange="setMoFilter(this.value)">
        <option value="all" ${MO.filter==='all'?'selected':''}>All member orders</option>
        ${Object.keys(MO_STAGE_LABEL).map(k=>`<option value="${k}" ${MO.filter===k?'selected':''}>${MO_STAGE_LABEL[k]}</option>`).join('')}
      </select>
    </div>
    ${list.length?list.map(moCard).join(''):'<div class="empty"><div class="empty-i">🧾</div><p>No orders here.</p></div>'}`;
}

function moPill(stage){
  const style=stage==='shipped'?'background:var(--lagoon);color:white'
    :stage==='awaiting_payment_verification'?'background:var(--sand-light);color:var(--text-mid)'
    :'background:var(--success-bg);color:var(--success)';
  return `<span class="pill-tiny" style="${style}">${MO_STAGE_LABEL[stage]||stage}</span>`;
}

function moCard(o){
  const items=(MO.itemsByOrder[o.id]||[]).map(i=>`${i.product_name}${i.variant?' ('+i.variant+')':''} ×${i.qty}`).join('<br>');
  let actions='';
  if(o.current_stage==='awaiting_payment_verification'){
    actions=`<button class="btn btn-p btn-sm" onclick="moAdvance('${o.id}','payment_confirmed')">Mark Payment Confirmed</button>`;
  }else if(o.current_stage==='payment_confirmed'){
    actions=`<button class="btn btn-p btn-sm" onclick="moAdvance('${o.id}','preparing_order')">Mark Preparing</button>`;
  }else if(o.current_stage==='preparing_order'){
    actions=`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%">
      <select class="inp" id="mo-courier-${o.id}" style="max-width:140px">
        <option value="">Courier</option><option value="spx">SPX</option><option value="jnt">J&amp;T</option>
      </select>
      <input class="inp" id="mo-track-${o.id}" placeholder="SPX tracking link or J&T number" style="flex:1;min-width:200px">
      <button class="btn btn-p btn-sm" onclick="moShip('${o.id}')">Mark Shipped</button>
    </div>`;
  }else{
    const t=o.tracking||{};
    actions=`<span class="t-muted" style="font-size:12.5px">Shipped via ${o.courier==='spx'?'SPX':'J&T'} — ${t.link||t.number||''}</span>`;
  }
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <div>
        <div class="t-muted" style="font-size:12px">#${o.id.slice(0,8)} · ${fmtDate(o.created_at)}</div>
        <div style="font-weight:600;color:var(--lagoon)">${o.customer_name}</div>
      </div>
      <div style="text-align:right"><div style="font-weight:600">${P(o.total)}</div>${moPill(o.current_stage)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;font-size:12.5px;line-height:1.7;margin-bottom:10px">
      <div>
        <div><strong>Address:</strong> ${o.address}</div>
        <div><strong>Contact:</strong> ${o.contact_number}</div>
        <div><strong>Updates via:</strong> ${o.contact_platform} (${o.contact_handle})</div>
        <div><strong>Region:</strong> ${o.region_label}</div>
        <div><strong>Payment:</strong> ${o.payment_method.toUpperCase()}${o.proof_url?` · <a href="${o.proof_url}" target="_blank" rel="noopener" style="color:var(--lagoon);font-weight:600">View proof →</a>`:''}</div>
        ${o.notes?`<div><strong>Note:</strong> ${o.notes}</div>`:''}
      </div>
      <div>
        <div><strong>Items:</strong></div><div>${items}</div>
        <div style="margin-top:4px">Subtotal ${P(o.subtotal)} + Shipping ${P(o.shipping_fee)}</div>
      </div>
    </div>
    <div style="border-top:1px solid var(--sand-light);padding-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">${actions}</div>
  </div>`;
}

function moStamp(o,key){return Object.assign({},o.stage_dates||{},{[key]:new Date().toISOString()});}

// Must match the platform dropdown value used for storefront sales in the Sales tab.
const MO_SALE_PLATFORM='Website';

function moTodayLocal(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

/* Records the order in the sales ledger and deducts stock.
   Runs once, when payment is confirmed. */
async function moRecordSale(o){
  const items=MO.itemsByOrder[o.id]||[];
  const total=parseFloat(o.total)||0;
  const platformFee=0;
  // Net profit for own-site sales = what the customer paid, minus product cost, minus shipping.
  const skuIds=items.filter(i=>i.sku_id).map(i=>i.sku_id);
  const skuRows=skuIds.length?await sbGet('skus',`id=in.(${skuIds.join(',')})&select=id,current_stock,unit_cost`):[];
  const skuById={};skuRows.forEach(r=>skuById[r.id]=r);
  const productCost=items.reduce((sum,i)=>sum+((skuById[i.sku_id]&&parseFloat(skuById[i.sku_id].unit_cost))||0)*i.qty,0);
  const netProfit=total-productCost-(parseFloat(o.shipping_fee)||0)-platformFee;
  const [sale]=await sbInsert('sales',{
    order_id:'MO-'+o.id.slice(0,8),
    platform:MO_SALE_PLATFORM,
    sale_date:moTodayLocal(),
    customer_name:o.customer_name,
    city_province:o.region_label,
    address:o.address,
    payment_method:o.payment_method,
    subtotal:o.subtotal,
    platform_fee:platformFee,
    shipping_fee:o.shipping_fee,
    total_amount:total,
    net_profit:netProfit,
    source:'Member order',
    notes:o.notes||null
  });
  try{
    const rows=items.filter(i=>i.sku_id).map(i=>({
      sale_id:sale.id,sku_id:i.sku_id,quantity:i.qty,unit_price:i.unit_price,subtotal:i.line_total
    }));
    if(rows.length) await sbInsert('sale_items',rows);
  }catch(e){
    await sbDelete('sales',`id=eq.${sale.id}`);
    throw e;
  }
  // Deduct stock
  for(const i of items){
    if(!i.sku_id)continue;
    const cur=skuById[i.sku_id];
    if(cur) await sbUpdate('skus',i.sku_id,{current_stock:(cur.current_stock||0)-i.qty});
  }
  salesCache=null; // make Sales/Home/Reports tabs reload fresh
  return sale.id;
}

async function moAdvance(id,stage){
  const o=MO.orders.find(x=>x.id===id);
  try{
    const patch={current_stage:stage,stage_dates:moStamp(o,stage)};
    if(stage==='payment_confirmed' && !o.sale_id){
      patch.sale_id=await moRecordSale(o);
    }
    await sbUpdate('mcc_orders',id,patch);
    toast(stage==='payment_confirmed'?'✓ Payment confirmed, sale recorded, stock updated':'✓ Order updated');
    renderMemberOrders();
  }catch(e){toast('Could not update: '+e.message);}
}

async function moShip(id){
  const o=MO.orders.find(x=>x.id===id);
  const courier=$('mo-courier-'+id).value;
  const val=$('mo-track-'+id).value.trim();
  if(!courier){toast('Choose a courier first.');return;}
  if(!val){toast(courier==='spx'?'Paste the SPX tracking link.':'Enter the J&T tracking number.');return;}
  const tracking=courier==='spx'?{type:'spx',link:val}:{type:'jnt',number:val};
  try{
    await sbUpdate('mcc_orders',id,{current_stage:'shipped',stage_dates:moStamp(o,'shipped'),courier,tracking});
    toast('✓ Marked as shipped');
    renderMemberOrders();
  }catch(e){toast('Could not update: '+e.message);}
}
