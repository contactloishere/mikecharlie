/* ─────────────────────────────────────────────────────────
   INVENTORY TAB
   renderInventory(), filteredSkus(), the table, New Product modal, Adjustment modal, Manual Cut modal.
   ───────────────────────────────────────────────────────── */

/* ─── INVENTORY TAB ─── */
function filteredSkus(){
  return S.skus.filter(s=>{
    if(S.search){
      const q=S.search.toLowerCase();
      const hay=(s.product_name+' '+s.sku_code+' '+(s.variant||'')).toLowerCase();
      if(!hay.includes(q))return false;
    }
    if(S.catFilter && (!s.categories||s.categories.id!==S.catFilter))return false;
    if(S.locFilter && s.location!==S.locFilter)return false;
    if(S.lowOnly && s.current_stock>s.low_stock_threshold)return false;
    return true;
  });
}

function renderInventory(){
  const list=filteredSkus();
  const lowCount=S.skus.filter(s=>s.current_stock<=s.low_stock_threshold).length;
  const sellableCount=S.skus.filter(s=>s.is_sellable).length;

  let html=`
  <div class="stat-strip">
    <div class="stat-box"><div class="stat-num">${S.skus.length}</div><div class="stat-lbl">Total SKUs</div></div>
    <div class="stat-box ${lowCount?'warn':''}"><div class="stat-num">${lowCount}</div><div class="stat-lbl">Low Stock</div></div>
    <div class="stat-box"><div class="stat-num">${sellableCount}</div><div class="stat-lbl">Sellable</div></div>
    <div class="stat-box"><div class="stat-num">${S.categories.length}</div><div class="stat-lbl">Categories</div></div>
  </div>
  <div class="card">
    <div class="toolbar">
      <input class="inp" placeholder="Search product, SKU, or variant..." value="${S.search}" oninput="S.search=this.value;renderInventory()">
      <select class="inp" onchange="S.catFilter=this.value;renderInventory()">
        <option value="">All Categories</option>
        ${S.categories.map(c=>`<option value="${c.id}" ${S.catFilter===c.id?'selected':''}>${c.name}</option>`).join('')}
      </select>
      <select class="inp" onchange="S.locFilter=this.value;renderInventory()">
        <option value="">All Locations</option>
        <option value="studio" ${S.locFilter==='studio'?'selected':''}>Studio</option>
        <option value="warehouse" ${S.locFilter==='warehouse'?'selected':''}>Warehouse</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-mid)">
        <input type="checkbox" ${S.lowOnly?'checked':''} onchange="S.lowOnly=this.checked;renderInventory()"> Low stock only
      </label>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p btn-sm" onclick="openNewProductModal()">+ New Product</button>
      <button class="btn btn-o btn-sm" onclick="openAdjustmentModal()">📋 Other Adjustment</button>
    </div>
  </div>`;

  if(!list.length){
    html+=`<div class="empty"><div class="empty-i">📦</div><p>No products match.</p></div>`;
  }else{
    html+=`<div class="table-wrap"><table><thead><tr>
      <th class="frz c1">Product Name</th><th class="frz c2">Stock</th><th class="frz c3">Actions</th>
      <th>SKU</th><th>Category</th><th>Location</th><th>Unit Cost</th><th>Price (Direct)</th><th>Price (Shopee)</th>
      <th>Sellable</th><th>Supplier</th><th>Notes</th>
    </tr></thead><tbody>`;
    list.forEach(s=>{
      const low=s.current_stock<=s.low_stock_threshold;
      html+=`<tr>
        <td class="frz c1"><strong>${s.product_name}</strong>${s.variant?`<br><span class="t-muted" style="font-size:11px">${s.variant}</span>`:''}</td>
        <td class="frz c2 ${low?'stock-low':'stock-ok'}">${s.current_stock}${low?' ⚠':''}</td>
        <td class="frz c3"><div class="act-btns">
          <button class="btn btn-p btn-sm" onclick="openNewProductModal('${s.id}')">✎ Edit</button>
          <button class="btn btn-o btn-sm" onclick="openAdjustmentModal('${s.id}')">±</button>
          <button class="btn btn-t btn-sm" onclick="openCutModal('${s.id}')">✂ Cut</button>
        </div></td>
        <td>${s.sku_code}</td>
        <td>${s.categories?s.categories.name:'<span class="t-muted">Unassigned</span>'}</td>
        <td><span class="pill-tiny ${s.location==='studio'?'pill-studio':'pill-warehouse'}">${s.location}</span></td>
        <td>${P(s.unit_cost)}</td>
        <td>${s.retail_price_direct!=null?P(s.retail_price_direct):'—'}</td>
        <td>${s.retail_price_shopee!=null?P(s.retail_price_shopee):'—'}</td>
        <td><span class="pill-tiny ${s.is_sellable?'pill-sellable':'pill-hidden'}">${s.is_sellable?'Yes':'No'}</span></td>
        <td>${s.supplier_source||'—'}</td>
        <td style="max-width:160px;white-space:normal">${s.notes||'—'}</td>
      </tr>`;
    });
    html+=`</tbody></table></div>`;
  }
  $('body').innerHTML=html;
}

/* ─── NEW PRODUCT ─── */
let recipeRowCount=0;
function toggleRecipeSection(){
  const on=$('np-has-recipe').checked;
  $('np-recipe-section').style.display=on?'block':'none';
  if(on && recipeRowCount===0)addRecipeRow();
}
function addRecipeRow(){
  recipeRowCount++;
  const id='rr-'+recipeRowCount;
  const rawOptions=S.skus.map(s=>`<option value="${s.id}">${s.sku_code} — ${s.product_name}${s.variant?' ('+s.variant+')':''}</option>`).join('');
  const div=document.createElement('div');
  div.className='recipe-row';
  div.id=id;
  div.innerHTML=`
    <div><label class="lbl">Raw Material</label><select class="inp raw-sel"><option value="">Select...</option>${rawOptions}</select></div>
    <div><label class="lbl">Qty Used</label><input class="inp raw-qty" type="number" value="1" min="1"></div>
    <button class="rm-btn" onclick="document.getElementById('${id}').remove()">✕</button>`;
  $('np-recipe-rows').appendChild(div);
}
let editingSkuId=null;
async function openNewProductModal(skuId){
  editingSkuId=skuId||null;
  ['np-name','np-sku','np-variant','np-cost','np-price-direct','np-price-shopee','np-supplier','np-notes','np-yield'].forEach(id=>$(id).value='');
  $('np-category').value='';$('np-location').value='studio';$('np-stock').value='0';$('np-threshold').value='5';$('np-active').checked=true;
  $('np-has-recipe').checked=false;$('np-recipe-section').style.display='none';$('np-recipe-rows').innerHTML='';recipeRowCount=0;

  if(editingSkuId){
    const s=S.skus.find(x=>x.id===editingSkuId);
    if(!s){toast('Product not found.');return;}
    $('np-modal-title').textContent='Edit Product';
    $('np-modal-sub').textContent='Changes here reflect in inventory and, once the storefront is live, on the shop page too.';
    $('np-stock-label').textContent='Current Stock';
    $('np-submit').textContent='Save Changes';
    $('np-name').value=s.product_name;
    $('np-sku').value=s.sku_code;
    $('np-variant').value=s.variant||'';
    $('np-category').value=s.category_id||'';
    $('np-location').value=s.location;
    $('np-cost').value=s.unit_cost;
    $('np-price-direct').value=s.retail_price_direct!=null?s.retail_price_direct:'';
    $('np-price-shopee').value=s.retail_price_shopee!=null?s.retail_price_shopee:'';
    $('np-stock').value=s.current_stock;
    $('np-threshold').value=s.low_stock_threshold;
    $('np-supplier').value=s.supplier_source||'';
    $('np-notes').value=s.notes||'';
    $('np-active').checked=s.is_active;

    try{
      const recipes=await sbGet('product_recipes',`finished_sku_id=eq.${editingSkuId}&select=*`);
      if(recipes.length){
        $('np-has-recipe').checked=true;
        $('np-recipe-section').style.display='block';
        $('np-yield').value=recipes[0].yield_qty;
        recipes.forEach(r=>{
          addRecipeRow();
          const lastRow=$('np-recipe-rows').lastElementChild;
          lastRow.querySelector('.raw-sel').value=r.raw_material_sku_id;
          lastRow.querySelector('.raw-qty').value=r.raw_qty_consumed;
        });
      }
    }catch(e){/* non-fatal — edit still works without pre-filled recipe */}
  }else{
    $('np-modal-title').textContent='New Product';
    $('np-modal-sub').textContent='Add a SKU without touching Supabase directly.';
    $('np-stock-label').textContent='Starting Stock';
    $('np-submit').textContent='Save Product';
  }
  openModal('np-modal');
}
async function submitNewProduct(){
  const name=$('np-name').value.trim(), sku=$('np-sku').value.trim();
  if(!name||!sku){toast('Product Name and SKU Code are required.');return;}
  const priceDirect=$('np-price-direct').value, priceShopee=$('np-price-shopee').value;
  const isSellable = !!(priceDirect || priceShopee);
  const btn=$('np-submit');const origLabel=btn.textContent;btn.textContent='Saving...';btn.disabled=true;
  try{
    const row={
      sku_code:sku, product_name:name, variant:$('np-variant').value.trim()||null,
      category_id:$('np-category').value||null, location:$('np-location').value,
      unit_cost:parseFloat($('np-cost').value)||0,
      retail_price_direct:priceDirect?parseFloat(priceDirect):null,
      retail_price_shopee:priceShopee?parseFloat(priceShopee):null,
      is_sellable:isSellable,
      is_active:$('np-active').checked,
      low_stock_threshold:parseInt($('np-threshold').value)||5,
      supplier_source:$('np-supplier').value.trim()||null,
      notes:$('np-notes').value.trim()||null
    };

    let targetSkuId;
    if(editingSkuId){
      row.current_stock=parseInt($('np-stock').value)||0; // direct correction, not a logged transaction
      await sbUpdate('skus',editingSkuId,row);
      targetSkuId=editingSkuId;
      // Simplest reliable way to keep recipes in sync: clear and re-add current rows
      await sbDelete('product_recipes',`finished_sku_id=eq.${editingSkuId}`);
    }else{
      row.current_stock=parseInt($('np-stock').value)||0;
      const saved=await sbInsert('skus',row);
      targetSkuId=saved[0].id;
    }

    if($('np-has-recipe').checked){
      const yieldQty=parseInt($('np-yield').value);
      if(!yieldQty){toast('Product saved, but recipe needs a Yield Quantity — add it later in Supabase if skipped.');}
      else{
        const rows=[...document.querySelectorAll('#np-recipe-rows .recipe-row')];
        for(const r of rows){
          const rawId=r.querySelector('.raw-sel').value;
          const rawQty=parseInt(r.querySelector('.raw-qty').value)||1;
          if(rawId){
            await sbInsert('product_recipes',{finished_sku_id:targetSkuId,raw_material_sku_id:rawId,yield_qty:yieldQty,raw_qty_consumed:rawQty});
          }
        }
      }
    }
    toast(editingSkuId?'✓ Changes saved!':'✓ Product saved!');
    closeModal('np-modal');
    editingSkuId=null;
    await initInventoryData();
  }catch(e){
    toast('Error: '+e.message);
  }finally{
    btn.textContent=origLabel;btn.disabled=false;
  }
}

/* ─── ADJUSTMENTS ─── */
function openAdjustmentModal(preselectSkuId){
  const sel=$('adj-sku');
  sel.innerHTML=S.skus.map(s=>`<option value="${s.id}">${s.sku_code} — ${s.product_name}${s.variant?' ('+s.variant+')':''} [${s.current_stock} in stock]</option>`).join('');
  if(preselectSkuId)sel.value=preselectSkuId;
  $('adj-qty').value='';$('adj-notes').value='';$('adj-type').value='adjustment_return';
  openModal('adj-modal');
}
function onAdjTypeChange(){
  const t=$('adj-type').value;
  const negative=['adjustment_personal_use','adjustment_freebie','adjustment_damage'].includes(t);
  const qty=$('adj-qty');
  if(!qty.value)qty.placeholder = negative ? 'e.g. -1' : 'e.g. 1';
}
async function submitAdjustment(){
  const skuId=$('adj-sku').value, type=$('adj-type').value;
  const qty=parseInt($('adj-qty').value);
  if(!skuId||!qty){toast('Select a product and enter a quantity.');return;}
  try{
    await sbRpc('apply_inventory_adjustment',{
      p_sku_id:skuId, p_txn_type:type, p_quantity_change:qty,
      p_notes:$('adj-notes').value.trim()||null, p_created_by:CURRENT_USER.id
    });
    toast('✓ Adjustment recorded!');
    closeModal('adj-modal');
    await initInventoryData();
  }catch(e){toast('Error: '+e.message);}
}

/* ─── MANUAL CUT ─── */
let cutTargetSku=null;
async function openCutModal(skuId){
  cutTargetSku=S.skus.find(s=>s.id===skuId);
  if(!cutTargetSku)return;
  $('cut-title').textContent='Cut: '+cutTargetSku.product_name+(cutTargetSku.variant?' ('+cutTargetSku.variant+')':'');
  $('cut-sub').textContent='Convert raw material into finished stock for this SKU.';
  $('cut-num').value='1';
  updateCutPreview();
  $('cut-num').oninput=updateCutPreview;
  openModal('cut-modal');
}
async function updateCutPreview(){
  const num=parseInt($('cut-num').value)||0;
  try{
    const recipes=await sbGet('product_recipes',`finished_sku_id=eq.${cutTargetSku.id}&select=*,raw:skus!raw_material_sku_id(sku_code,product_name,current_stock)`);
    if(!recipes.length){
      $('cut-preview').innerHTML=`<p style="font-size:12px;color:var(--danger)">This product has no recipe set up — nothing to cut. Add one via New Product or Supabase.</p>`;
      return;
    }
    const yieldQty=recipes[0].yield_qty;
    let html=`<p style="font-size:12px;color:var(--text-mid);margin-bottom:6px">This will produce <strong>${yieldQty*num}</strong> units of ${cutTargetSku.product_name}${cutTargetSku.variant?' ('+cutTargetSku.variant+')':''}, consuming:</p>`;
    recipes.forEach(r=>{
      html+=`<div style="font-size:12px;display:flex;justify-content:space-between;padding:3px 0"><span>${r.raw.sku_code} — ${r.raw.product_name}</span><span>−${r.raw_qty_consumed*num} (has ${r.raw.current_stock})</span></div>`;
    });
    $('cut-preview').innerHTML=html;
  }catch(e){
    $('cut-preview').innerHTML=`<p style="font-size:12px;color:var(--danger)">Couldn't load recipe: ${e.message}</p>`;
  }
}
async function submitCut(){
  const num=parseInt($('cut-num').value);
  if(!num||num<1){toast('Enter a valid number of cuts.');return;}
  try{
    await sbRpc('process_manual_cut',{p_finished_sku_id:cutTargetSku.id,p_num_cuts:num,p_created_by:CURRENT_USER.id});
    toast('✓ Cut complete!');
    closeModal('cut-modal');
    await initInventoryData();
  }catch(e){toast('Error: '+e.message);}
}
