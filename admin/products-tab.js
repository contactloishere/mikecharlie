/* ─────────────────────────────────────────────────────────
   PRODUCTS TAB
   Listings, variants, photos, recipes.
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTS TAB — Listings, Variants, Photos, Recipes — all in one place
   ═══════════════════════════════════════════════════════════════════════ */
async function renderProducts(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading products...</p></div>`;
  try{
    const [listings,skus,photos,recipes,cats]=await Promise.all([
      sbGet('product_listings','select=*'),
      sbGet('skus','select=*,categories(id,name)&order=product_name.asc'),
      sbGet('variant_photos','select=sku_id,photo_url'),
      sbGet('product_recipes','select=*'),
      sbGet('categories','select=*&order=display_order.asc')
    ]);
    PS.listings=listings;PS.allSkus=skus;PS.categories=cats;PS.recipesAll=recipes;
    PS.photoMap={};photos.forEach(p=>{if(p.photo_url)PS.photoMap[p.sku_id]=p.photo_url;});
    renderProductsList();
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load products.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}

function renderProductsList(){
  const map={};
  PS.allSkus.forEach(s=>{
    if(!map[s.product_name])map[s.product_name]=[];
    map[s.product_name].push(s);
  });
  PS.groups=Object.entries(map);
  let html=`<div class="card"><div class="card-title">🗂️ All Products</div>
    <p class="t-muted" style="font-size:13px;margin-bottom:12px">Everything here — photos, descriptions, prices, stock, recipes — is editable right from this screen. Supabase stays untouched from here on.</p>
    <button class="btn btn-p btn-sm" onclick="openNewListingModal()">+ New Product</button>
  </div>`;
  if(!PS.groups.length){
    html+=`<div class="empty"><div class="empty-i">🗂️</div><p>No products yet.</p></div>`;
  }else{
    html+=`<div class="listing-grid">`;
    PS.groups.forEach(([title,arr],idx)=>{
      const listing=PS.listings.find(l=>l.title===title);
      const thumb=listing&&listing.cover_image_url;
      const inactiveCount=arr.filter(s=>!s.is_active).length;
      html+=`<div class="listing-card" onclick="openListingDetail(${idx})">
        <div class="listing-thumb">${thumb?`<img src="${attrEsc(thumb)}">`:'🌿'}</div>
        <div class="listing-info">
          <div class="listing-title">${title}</div>
          <div class="listing-meta">${arr.length} variant${arr.length!==1?'s':''}${inactiveCount?' · '+inactiveCount+' inactive':''}</div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  $('body').innerHTML=html;
}

function openNewListingModal(){
  $('nl-title').value='';
  openModal('newlisting-modal');
}
async function submitNewListing(){
  const title=$('nl-title').value.trim();
  if(!title){toast('Enter a title.');return;}
  if(PS.listings.some(l=>l.title===title)){toast('A listing with that title already exists.');return;}
  try{
    const saved=await sbInsert('product_listings',{title});
    PS.listings.push(saved[0]);
    toast('✓ Listing created — now add your first variant.');
    closeModal('newlisting-modal');
    PS.currentTitle=title;
    PS.currentListing=saved[0];
    PS.variants=[];
    PS.expandedId=null;
    PS.newVariantCounter=0;
    renderListingDetail();
  }catch(e){toast('Error: '+e.message);}
}

function blankListing(title){
  return {title,cover_image_url:'',image_1:'',image_2:'',image_3:'',image_4:'',image_5:'',
    image_6:'',image_7:'',image_8:'',image_9:'',short_description:'',long_description:'',
    subsection_1_title:'',subsection_1_body:'',subsection_2_title:'',subsection_2_body:'',
    subsection_3_title:'',subsection_3_body:'',subsection_4_title:'',subsection_4_body:''};
}

function openListingDetail(idx){
  const [title,skusArr]=PS.groups[idx];
  PS.currentTitle=title;
  PS.currentListing=PS.listings.find(l=>l.title===title)||blankListing(title);
  PS.variants=skusArr.map(s=>({
    ...s,
    photo_url:PS.photoMap[s.id]||'',
    _recipeRows:PS.recipesAll.filter(r=>r.finished_sku_id===s.id),
    _isNew:false
  }));
  PS.expandedId=null;
  PS.newVariantCounter=0;
  renderListingDetail();
}

function renderListingDetail(){
  const l=PS.currentListing;
  let html=`<button class="pl-back" onclick="renderProductsList()">← Back to Products</button>`;
  html+=`<div class="card">
    <div class="card-title">📝 Listing Content</div>
    <label class="lbl">Title</label>
    <input class="inp" id="pl-title" value="${attrEsc(l.title)}">
    <p class="t-muted" style="font-size:11px;margin:-8px 0 12px">Renaming this updates all ${PS.variants.length} variant(s) under it automatically.</p>
    <label class="lbl">Cover Photo URL</label>
    <input class="inp" id="pl-cover" value="${attrEsc(l.cover_image_url)}" placeholder="Paste a photo URL">
    <label class="lbl">Additional Photos (up to 9)</label>
    <div class="photo-grid" style="margin-bottom:12px">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<input class="inp" id="pl-image-${n}" placeholder="Photo ${n} URL" value="${attrEsc(l['image_'+n])}">`).join('')}
    </div>
    <label class="lbl">Short Description <span class="t-muted">(shown on the shop grid card)</span></label>
    <textarea class="inp" id="pl-short">${l.short_description||''}</textarea>
    <label class="lbl">Long Description <span class="t-muted">(shown on the product page)</span></label>
    <textarea class="inp" id="pl-long" rows="4">${l.long_description||''}</textarea>
    ${[1,2,3,4].map(n=>`
      <label class="lbl">Subsection ${n} Title</label>
      <input class="inp" id="pl-sub${n}-title" value="${attrEsc(l['subsection_'+n+'_title'])}" placeholder="e.g. Use and Care">
      <label class="lbl">Subsection ${n} Body</label>
      <textarea class="inp" id="pl-sub${n}-body">${l['subsection_'+n+'_body']||''}</textarea>
    `).join('')}
    <button class="btn btn-p" onclick="saveListingContent()">Save Listing Content</button>
  </div>`;

  html+=`<div class="card"><div class="card-title">🎨 Variants (${PS.variants.length})</div>`;
  PS.variants.forEach(v=>{html+=variantAccordionHtml(v);});
  html+=`<button class="btn btn-g btn-block" onclick="addNewVariant()">+ Add Variant</button></div>`;

  $('body').innerHTML=html;
}

function variantAccordionHtml(v){
  const key=v.id||v._tempId;
  const open=PS.expandedId===key;
  const low=v.current_stock<=v.low_stock_threshold;
  return `<div class="variant-acc">
    <div class="variant-acc-hdr" onclick="toggleVariantAcc('${key}')">
      <div>
        <div class="variant-acc-title">${v.variant||v.sku_code||'(unsaved variant)'}${v._isNew?' <span class="t-muted">(new)</span>':''}${v.is_active===false?' <span class="t-muted">(inactive)</span>':''}</div>
        <div class="variant-acc-sub">${v.sku_code||'no SKU yet'} · ${v.retail_price_direct!=null?P(v.retail_price_direct):'no price'} · Stock: <span class="${low?'stock-low':''}">${v.current_stock}</span></div>
      </div>
      <span class="variant-acc-arrow ${open?'open':''}">▼</span>
    </div>
    <div class="variant-acc-body ${open?'open':''}" id="vbody-${key}">
      ${open?variantFormHtml(v,key):''}
    </div>
  </div>`;
}

function recipeRowHtml(key,ri,row){
  const rawOptions=PS.allSkus.map(s=>`<option value="${s.id}" ${row&&row.raw_material_sku_id===s.id?'selected':''}>${s.sku_code} — ${s.product_name}${s.variant?' ('+s.variant+')':''}</option>`).join('');
  return `<div class="recipe-row" id="v-recipe-row-${key}-${ri}">
    <div><label class="lbl">Raw Material</label><select class="inp raw-sel"><option value="">Select...</option>${rawOptions}</select></div>
    <div><label class="lbl">Qty Used</label><input class="inp raw-qty" type="number" value="${row?row.raw_qty_consumed:1}" min="1"></div>
    <button class="rm-btn" type="button" onclick="document.getElementById('v-recipe-row-${key}-${ri}').remove()">✕</button>
  </div>`;
}

function variantFormHtml(v,key){
  const cats=PS.categories||[];
  const hasRecipe=v._recipeRows&&v._recipeRows.length>0;
  return `
    <label class="lbl">Variant Name</label>
    <input class="inp" id="v-variant-${key}" value="${attrEsc(v.variant)}">
    <label class="lbl">SKU Code ${v._isNew?'*':''}</label>
    <input class="inp" id="v-sku-${key}" value="${attrEsc(v.sku_code)}" ${v._isNew?'':'readonly style="background:var(--pearl)"'}>
    <div class="field-row field-row-2">
      <div><label class="lbl">Category</label>
        <select class="inp" id="v-cat-${key}"><option value="">— None —</option>
          ${cats.map(c=>`<option value="${c.id}" ${v.category_id===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select></div>
      <div><label class="lbl">Location</label>
        <select class="inp" id="v-loc-${key}">
          <option value="studio" ${v.location==='studio'?'selected':''}>Studio</option>
          <option value="warehouse" ${v.location==='warehouse'?'selected':''}>Warehouse</option>
        </select></div>
    </div>
    <div class="field-row field-row-2">
      <div><label class="lbl">Unit Cost (₱)</label><input class="inp" type="number" step="0.01" id="v-cost-${key}" value="${v.unit_cost||0}"></div>
      <div><label class="lbl">Current Stock</label><input class="inp" type="number" id="v-stock-${key}" value="${v.current_stock||0}"></div>
    </div>
    <div class="field-row field-row-2">
      <div><label class="lbl">Price – Direct (₱)</label><input class="inp" type="number" step="0.01" id="v-pricedirect-${key}" value="${v.retail_price_direct!=null?v.retail_price_direct:''}"></div>
      <div><label class="lbl">Price – Shopee (₱)</label><input class="inp" type="number" step="0.01" id="v-priceshopee-${key}" value="${v.retail_price_shopee!=null?v.retail_price_shopee:''}"></div>
    </div>
    <div class="check-row"><input type="checkbox" id="v-onsale-${key}" ${v.is_on_sale?'checked':''}><label for="v-onsale-${key}">On Sale</label></div>
    <label class="lbl">Sale Price (₱)</label>
    <input class="inp" type="number" step="0.01" id="v-saleprice-${key}" value="${v.sale_price!=null?v.sale_price:''}">
    <label class="lbl">Ribbon Text</label>
    <input class="inp" id="v-ribbon-${key}" value="${attrEsc(v.ribbon_text)}" placeholder="e.g. Bestseller, New Arrival">
    <label class="lbl">Low Stock Threshold</label>
    <input class="inp" type="number" id="v-threshold-${key}" value="${v.low_stock_threshold||5}">
    <label class="lbl">Photo URL <span class="t-muted">(this specific variant)</span></label>
    <input class="inp" id="v-photo-${key}" value="${attrEsc(v.photo_url)}" placeholder="Paste a photo URL">
    <label class="lbl">Supplier/Source</label>
    <input class="inp" id="v-supplier-${key}" value="${attrEsc(v.supplier_source)}">
    <label class="lbl">Notes</label>
    <textarea class="inp" id="v-notes-${key}">${v.notes||''}</textarea>
    <div class="check-row"><input type="checkbox" id="v-active-${key}" ${v.is_active!==false?'checked':''}><label for="v-active-${key}">Active</label></div>

    <div class="check-row"><input type="checkbox" id="v-hasrecipe-${key}" onchange="toggleVariantRecipe('${key}')" ${hasRecipe?'checked':''}><label for="v-hasrecipe-${key}">This variant is cut/assembled from raw materials</label></div>
    <div id="v-recipe-section-${key}" style="display:${hasRecipe?'block':'none'}">
      <label class="lbl">Yield Quantity <span class="t-muted">(units produced per cut/assembly)</span></label>
      <input class="inp" type="number" id="v-yield-${key}" value="${hasRecipe?v._recipeRows[0].yield_qty:1}">
      <label class="lbl">Raw Materials</label>
      <div id="v-recipe-rows-${key}">
        ${(v._recipeRows||[]).map((r,ri)=>recipeRowHtml(key,ri,r)).join('')}
      </div>
      <button class="btn btn-o btn-sm" type="button" onclick="addVariantRecipeRow('${key}')">+ Add Raw Material</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-p" onclick="saveVariant('${key}')">Save Variant</button>
      ${!v._isNew?`<button class="btn btn-danger btn-sm" onclick="deactivateVariant('${key}')">Deactivate</button>`:''}
    </div>
  `;
}

function toggleVariantAcc(key){
  PS.expandedId=PS.expandedId===key?null:key;
  renderListingDetail();
}
function toggleVariantRecipe(key){
  const checked=$('v-hasrecipe-'+key).checked;
  $('v-recipe-section-'+key).style.display=checked?'block':'none';
}
let recipeRowCounter=0;
function addVariantRecipeRow(key){
  recipeRowCounter++;
  $('v-recipe-rows-'+key).insertAdjacentHTML('beforeend',recipeRowHtml(key,'new'+recipeRowCounter,null));
}
function addNewVariant(){
  PS.newVariantCounter++;
  const tempId='newv'+PS.newVariantCounter;
  PS.variants.push({
    id:null,_tempId:tempId,_isNew:true,product_name:PS.currentTitle,
    sku_code:'',variant:'',category_id:null,location:'studio',unit_cost:0,
    current_stock:0,retail_price_direct:null,retail_price_shopee:null,
    is_on_sale:false,sale_price:null,ribbon_text:null,low_stock_threshold:5,
    supplier_source:null,notes:null,is_active:true,photo_url:'',_recipeRows:[]
  });
  PS.expandedId=tempId;
  renderListingDetail();
}

async function saveListingContent(){
  const oldTitle=PS.currentTitle;
  const newTitle=$('pl-title').value.trim();
  if(!newTitle){toast('Title is required.');return;}
  const payload={
    title:newTitle,
    cover_image_url:$('pl-cover').value.trim()||null,
    short_description:$('pl-short').value.trim()||null,
    long_description:$('pl-long').value.trim()||null,
  };
  for(let n=1;n<=9;n++)payload['image_'+n]=$('pl-image-'+n).value.trim()||null;
  for(let n=1;n<=4;n++){
    payload['subsection_'+n+'_title']=$('pl-sub'+n+'-title').value.trim()||null;
    payload['subsection_'+n+'_body']=$('pl-sub'+n+'-body').value.trim()||null;
  }
  try{
    if(PS.currentListing.id){
      await sbUpdate('product_listings',PS.currentListing.id,payload);
    }else{
      const saved=await sbInsert('product_listings',payload);
      PS.currentListing=saved[0];
    }
    if(newTitle!==oldTitle){
      const r=await fetch(`${SB_URL}/rest/v1/skus?product_name=eq.${encodeURIComponent(oldTitle)}`,{
        method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({product_name:newTitle})
      });
      if(!r.ok)throw new Error('Renamed listing, but updating linked variants failed — check Supabase.');
      PS.currentTitle=newTitle;
      PS.variants.forEach(v=>v.product_name=newTitle);
    }
    Object.assign(PS.currentListing,payload);
    toast('✓ Listing content saved!');
  }catch(e){toast('Error: '+e.message);}
}

async function upsertVariantPhoto(skuId,url){
  const r=await fetch(`${SB_URL}/rest/v1/variant_photos?on_conflict=sku_id`,{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=representation'}),
    body:JSON.stringify({sku_id:skuId,photo_url:url||null})
  });
  if(!r.ok)throw new Error('Photo save failed: '+(await r.text()));
}

async function saveVariant(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v)return;
  const skuCode=$('v-sku-'+key).value.trim();
  if(!skuCode){toast('SKU Code is required.');return;}
  const priceDirect=$('v-pricedirect-'+key).value;
  const priceShopee=$('v-priceshopee-'+key).value;
  const salePrice=$('v-saleprice-'+key).value;
  const payload={
    sku_code:skuCode,
    product_name:PS.currentTitle,
    variant:$('v-variant-'+key).value.trim()||null,
    category_id:$('v-cat-'+key).value||null,
    location:$('v-loc-'+key).value,
    unit_cost:parseFloat($('v-cost-'+key).value)||0,
    current_stock:parseInt($('v-stock-'+key).value)||0,
    retail_price_direct:priceDirect?parseFloat(priceDirect):null,
    retail_price_shopee:priceShopee?parseFloat(priceShopee):null,
    is_on_sale:$('v-onsale-'+key).checked,
    sale_price:salePrice?parseFloat(salePrice):null,
    ribbon_text:$('v-ribbon-'+key).value.trim()||null,
    low_stock_threshold:parseInt($('v-threshold-'+key).value)||5,
    supplier_source:$('v-supplier-'+key).value.trim()||null,
    notes:$('v-notes-'+key).value.trim()||null,
    is_active:$('v-active-'+key).checked,
    is_sellable:!!(priceDirect||priceShopee)
  };
  const photoUrl=$('v-photo-'+key).value.trim();

  try{
    let savedId;
    if(v._isNew){
      const saved=await sbInsert('skus',payload);
      savedId=saved[0].id;
    }else{
      await sbUpdate('skus',v.id,payload);
      savedId=v.id;
    }
    Object.assign(v,payload,{id:savedId,_isNew:false});

    await upsertVariantPhoto(savedId,photoUrl);
    v.photo_url=photoUrl;

    const hasRecipe=$('v-hasrecipe-'+key).checked;
    await sbDelete('product_recipes',`finished_sku_id=eq.${savedId}`);
    let newRecipeRows=[];
    if(hasRecipe){
      const yieldQty=parseInt($('v-yield-'+key).value)||1;
      const rows=[...document.querySelectorAll('#v-recipe-rows-'+key+' .recipe-row')];
      for(const row of rows){
        const rawId=row.querySelector('.raw-sel').value;
        const rawQty=parseInt(row.querySelector('.raw-qty').value)||1;
        if(rawId){
          await sbInsert('product_recipes',{finished_sku_id:savedId,raw_material_sku_id:rawId,yield_qty:yieldQty,raw_qty_consumed:rawQty});
          newRecipeRows.push({raw_material_sku_id:rawId,yield_qty:yieldQty,raw_qty_consumed:rawQty});
        }
      }
    }
    v._recipeRows=newRecipeRows;

    // Refresh the master lists so other variants' raw-material pickers see this one too
    if(!PS.allSkus.find(s=>s.id===savedId))PS.allSkus.push({...v});

    toast('✓ Variant saved!');
    renderListingDetail();
  }catch(e){
    toast('Error: '+e.message);
  }
}

async function deactivateVariant(key){
  const v=PS.variants.find(x=>(x.id||x._tempId)===key);
  if(!v||!v.id)return;
  if(!confirm('Deactivate this variant? It disappears from the shop but stays in your records.'))return;
  try{
    await sbUpdate('skus',v.id,{is_active:false,is_sellable:false});
    v.is_active=false;v.is_sellable=false;
    toast('✓ Deactivated.');
    renderListingDetail();
  }catch(e){toast('Error: '+e.message);}
}
