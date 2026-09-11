/* ─────────────────────────────────────────────────────────
   TAKE ORDER TAB
   renderTakeOrder() + submitTakeOrder() (originally placed after the Reports section in the single-file version, moved here so all Take Order logic lives in one place).
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   TAKE ORDER TAB
   ═══════════════════════════════════════════════════════════════════════ */
const takeOrder={
  platform:'Direct', orderId:'', saleDate:'', customerName:'', cityProvince:'',
  paymentMethod:'Cash', paymentMethodOther:'', platformFee:0, shippingFee:0,
  items:[] // {tempId, skuId, label, unitCost, qty, unitPrice}
};
let toItemCounter=0;

function genOrderId(){return 'MCC-'+Date.now().toString(36).toUpperCase();}

function resetTakeOrder(){
  takeOrder.platform='Direct';
  takeOrder.orderId=genOrderId();
  takeOrder.saleDate=new Date().toISOString().split('T')[0];
  takeOrder.customerName='';
  takeOrder.cityProvince='';
  takeOrder.paymentMethod='Cash';
  takeOrder.paymentMethodOther='';
  takeOrder.platformFee=0;
  takeOrder.shippingFee=0;
  takeOrder.items=[];
}

function toPriceForSku(sku){
  // Shopee/Lazada pull the Shopee price; everything else pulls Direct price
  const usesShopeePrice = (takeOrder.platform==='Shopee'||takeOrder.platform==='Lazada');
  const p = usesShopeePrice ? sku.retail_price_shopee : sku.retail_price_direct;
  return p!=null ? p : (sku.retail_price_direct!=null?sku.retail_price_direct:(sku.retail_price_shopee||0));
}

function toSubtotal(){
  return takeOrder.items.reduce((s,i)=>s+(parseFloat(i.qty)||0)*(parseFloat(i.unitPrice)||0),0);
}
function toTotal(){
  return toSubtotal()+(parseFloat(takeOrder.shippingFee)||0);
}

function renderTakeOrder(){
  if(!takeOrder.orderId)resetTakeOrder();
  const showPlatformFees = takeOrder.platform==='Shopee'||takeOrder.platform==='Lazada';
  let html=`
  <div class="card">
    <div class="card-title">🛍️ Take Order — Log a Sale</div>
    <div class="field-row field-row-2">
      <div><label class="lbl">Date</label><input class="inp" type="date" id="to-date" value="${takeOrder.saleDate}" onchange="takeOrder.saleDate=this.value"></div>
      <div><label class="lbl">Platform</label>
        <select class="inp" id="to-platform" onchange="onPlatformChange(this.value)">
          ${['Direct','Shopee','Lazada','Website','Other'].map(p=>`<option value="${p}" ${takeOrder.platform===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <label class="lbl">Order ID</label>
    <input class="inp" id="to-orderid" value="${takeOrder.orderId}" placeholder="${showPlatformFees?'Paste the '+takeOrder.platform+' order ID':'Auto-generated'}" oninput="takeOrder.orderId=this.value">
    <div class="field-row field-row-2">
      <div><label class="lbl">Customer Name</label><input class="inp" id="to-custname" value="${takeOrder.customerName}" oninput="takeOrder.customerName=this.value"></div>
      <div><label class="lbl">City/Province</label><input class="inp" id="to-city" value="${takeOrder.cityProvince}" oninput="takeOrder.cityProvince=this.value"></div>
    </div>
    <label class="lbl">Payment Method</label>
    <select class="inp" id="to-paymethod" onchange="takeOrder.paymentMethod=this.value;renderTakeOrder()">
      ${['Cash','GCash','GoTyme','Maribank','CIMB Bank','BDO','Other'].map(p=>`<option value="${p}" ${takeOrder.paymentMethod===p?'selected':''}>${p}</option>`).join('')}
    </select>
    ${takeOrder.paymentMethod==='Other'?`<input class="inp" placeholder="e.g. SPaylater, COD" value="${takeOrder.paymentMethodOther}" oninput="takeOrder.paymentMethodOther=this.value">`:''}
    ${showPlatformFees?`<div class="field-row field-row-2">
      <div><label class="lbl">Platform Fee (₱)</label><input class="inp" type="number" step="0.01" value="${takeOrder.platformFee}" oninput="takeOrder.platformFee=this.value;renderTotalsOnly()"></div>
      <div><label class="lbl">Shipping Fee (₱)</label><input class="inp" type="number" step="0.01" value="${takeOrder.shippingFee}" oninput="takeOrder.shippingFee=this.value;renderTotalsOnly()"></div>
    </div>`:''}
  </div>

  <div class="card">
    <div class="card-title">Products in this Sale</div>
    <div id="to-items"></div>
    <button class="btn btn-g btn-block" onclick="addTakeOrderItem()">+ Add Product to Sale</button>
    <div class="to-total-strip"><span class="to-total-lbl">Total Transaction Amount</span><span class="to-total-amt" id="to-total-amt">${P(toTotal())}</span></div>
    <button class="btn btn-p btn-block" id="to-submit" onclick="submitTakeOrder()">Record Sale</button>
  </div>`;
  $('body').innerHTML=html;
  renderTakeOrderItems();
}

function onPlatformChange(val){
  takeOrder.platform=val;
  // Re-price existing lines to match the new platform
  takeOrder.items.forEach(item=>{
    const sku=S.skus.find(s=>s.id===item.skuId);
    if(sku)item.unitPrice=toPriceForSku(sku);
  });
  renderTakeOrder();
}

function renderTotalsOnly(){
  const el=$('to-total-amt');
  if(el)el.textContent=P(toTotal());
}

function renderTakeOrderItems(){
  const wrap=$('to-items');
  if(!wrap)return;
  if(!takeOrder.items.length){
    wrap.innerHTML=`<div class="to-empty">No products added yet. Click 'Add Product' below.</div>`;
    return;
  }
  wrap.innerHTML=takeOrder.items.map(item=>`
    <div class="to-item-card" id="to-card-${item.tempId}">
      <button class="to-item-remove" onclick="removeTakeOrderItem(${item.tempId})">Remove</button>
      <label class="lbl">Product Name / SKU:</label>
      <div class="to-search-wrap">
        <input class="inp" id="to-search-${item.tempId}" placeholder="Start typing product name..."
          value="${item.label||''}" autocomplete="off"
          oninput="onProductSearch(${item.tempId},this.value)"
          onfocus="onProductSearch(${item.tempId},this.value)">
        <div class="to-search-results" id="to-results-${item.tempId}"></div>
      </div>
      <label class="lbl">Quantity Sold:</label>
      <input class="inp" type="number" min="1" id="to-qty-${item.tempId}" value="${item.qty}"
        oninput="updateTakeOrderItem(${item.tempId},'qty',this.value)">
      <label class="lbl">Unit Price:</label>
      <input class="inp" type="number" step="0.01" id="to-price-${item.tempId}" value="${item.unitPrice}"
        oninput="updateTakeOrderItem(${item.tempId},'unitPrice',this.value)">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:var(--lagoon)">
        <span>Item Subtotal:</span><span>${((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0)).toFixed(2)}</span>
      </div>
    </div>`).join('');
}

function addTakeOrderItem(){
  toItemCounter++;
  takeOrder.items.push({tempId:toItemCounter, skuId:null, label:'', unitCost:0, qty:1, unitPrice:0});
  renderTakeOrderItems();
}
function removeTakeOrderItem(tempId){
  takeOrder.items=takeOrder.items.filter(i=>i.tempId!==tempId);
  renderTakeOrderItems();
  renderTotalsOnly();
}
function updateTakeOrderItem(tempId,field,value){
  const item=takeOrder.items.find(i=>i.tempId===tempId);
  if(!item)return;
  item[field]=value;
  const card=$('to-card-'+tempId);
  if(card){
    const subEl=card.querySelector('.to-item-card > div:last-child span:last-child');
    if(subEl)subEl.textContent=((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0)).toFixed(2);
  }
  renderTotalsOnly();
}

function onProductSearch(tempId,query){
  const resultsEl=$('to-results-'+tempId);
  if(!resultsEl)return;
  if(!query||query.length<1){resultsEl.classList.remove('show');resultsEl.innerHTML='';return;}
  const q=query.toLowerCase();
  const matches=S.skus.filter(s=>{
    const hay=(s.product_name+' '+s.sku_code+' '+(s.variant||'')).toLowerCase();
    return hay.includes(q);
  }).slice(0,8);
  if(!matches.length){
    resultsEl.innerHTML=`<div class="to-search-result t-muted">No matches</div>`;
    resultsEl.classList.add('show');
    return;
  }
  resultsEl.innerHTML=matches.map(s=>`
    <div class="to-search-result" onclick="selectTakeOrderProduct(${tempId},'${s.id}')">
      <div class="srn">${s.product_name}${s.variant?' — '+s.variant:''}</div>
      <div class="srs">${s.sku_code} · Stock: ${s.current_stock}</div>
    </div>`).join('');
  resultsEl.classList.add('show');
}
function selectTakeOrderProduct(tempId,skuId){
  const sku=S.skus.find(s=>s.id===skuId);
  const item=takeOrder.items.find(i=>i.tempId===tempId);
  if(!sku||!item)return;
  item.skuId=sku.id;
  item.label=sku.product_name+(sku.variant?' — '+sku.variant:'');
  item.unitCost=sku.unit_cost;
  item.unitPrice=toPriceForSku(sku);
  $('to-search-'+tempId).value=item.label;
  $('to-results-'+tempId).classList.remove('show');
  $('to-price-'+tempId).value=item.unitPrice;
  updateTakeOrderItem(tempId,'unitPrice',item.unitPrice);
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.to-search-wrap')){
    document.querySelectorAll('.to-search-results').forEach(el=>el.classList.remove('show'));
  }
});

async function submitTakeOrder(){
  if(!takeOrder.items.length){toast('Add at least one product to the sale.');return;}
  const missing=takeOrder.items.find(i=>!i.skuId);
  if(missing){toast('One of your product lines is not linked to a real product — pick it from the search results.');return;}
  if(!takeOrder.orderId.trim()){toast('Order ID is required.');return;}

  const btn=$('to-submit');btn.textContent='Recording...';btn.disabled=true;
  try{
    const items=takeOrder.items.map(i=>({
      sku_id:i.skuId,
      quantity:parseInt(i.qty)||1,
      unit_price:parseFloat(i.unitPrice)||0,
      subtotal:(parseInt(i.qty)||1)*(parseFloat(i.unitPrice)||0)
    }));
    const paymentMethod = takeOrder.paymentMethod==='Other' ? (takeOrder.paymentMethodOther||'Other') : takeOrder.paymentMethod;

    await sbRpc('record_sale',{
      p_platform: takeOrder.platform.toLowerCase(),
      p_order_id: takeOrder.orderId.trim(),
      p_sale_date: takeOrder.saleDate,
      p_customer_name: takeOrder.customerName||null,
      p_city_province: takeOrder.cityProvince||null,
      p_payment_method: paymentMethod,
      p_platform_fee: parseFloat(takeOrder.platformFee)||0,
      p_shipping_fee: parseFloat(takeOrder.shippingFee)||0,
      p_items: items,
      p_source: 'manual',
      p_notes: null,
      p_created_by: CURRENT_USER.id
    });
    toast('✓ Sale recorded!');
    resetTakeOrder();
    await initInventoryData(); // refresh S.skus so stock counts reflect the sale
    renderTakeOrder();
  }catch(e){
    toast('Error: '+e.message);
  }finally{
    btn.textContent='Record Sale';btn.disabled=false;
  }
}
