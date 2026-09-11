/* ─────────────────────────────────────────────────────────
   SALES LOG TAB
   renderSalesLog().
   ───────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════
   SALES LOG TAB
   ═══════════════════════════════════════════════════════════════════════ */
let salesLogMonth=null; // 'YYYY-MM', null = auto (current month)
function monthOptions(){
  const opts=[];
  const now=new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const val=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const lbl=d.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
    opts.push({val,lbl});
  }
  return opts;
}
async function renderSalesLog(){
  $('body').innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;color:var(--text-muted)">
    <div style="width:32px;height:32px;border:3px solid var(--sand);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem"></div>
    <p>Loading sales log...</p></div>`;
  try{
    const sales=await fetchSalesData();
    const now=new Date();
    const currentMonthVal=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    if(!salesLogMonth)salesLogMonth=currentMonthVal; // auto-advances since this recomputes on every visit

    const monthSales=sales.filter(s=>s.sale_date && s.sale_date.startsWith(salesLogMonth));
    const totalRevenue=monthSales.reduce((s,x)=>s+parseFloat(x.total_amount||0),0);

    let html=`<div class="card">
      <div class="toolbar">
        <select class="inp" onchange="salesLogMonth=this.value;renderSalesLog()">
          ${monthOptions().map(o=>`<option value="${o.val}" ${salesLogMonth===o.val?'selected':''}>${o.lbl}</option>`).join('')}
        </select>
        <div style="font-size:13px;color:var(--text-mid)"><strong>${monthSales.length}</strong> sales · <strong style="color:var(--lagoon)">${P(totalRevenue)}</strong> total revenue</div>
      </div>
    </div>`;

    if(!monthSales.length){
      html+=`<div class="empty"><div class="empty-i">💰</div><p>No sales recorded for this month yet.</p></div>`;
    }else{
      html+=`<div class="table-wrap"><table><thead><tr>
        <th class="frz c1">Date</th><th class="frz c2">Platform</th><th class="frz c3">Customer</th>
        <th>Qty</th><th>Item</th><th>Item Subtotal</th><th>Line Unit Cost</th>
        <th>Transaction Total</th><th>Platform Fee</th><th>Shipping Fee</th><th>Net Profit</th>
        <th>City/Province</th><th>Payment Method</th><th>Notes</th>
      </tr></thead><tbody>`;
      monthSales.forEach(sale=>{
        const items=sale.sale_items&&sale.sale_items.length?sale.sale_items:[{quantity:'—',subtotal:0,skus:null,unit_price:0}];
        items.forEach((item,idx)=>{
          const lineCost=item.skus?(item.skus.unit_cost*item.quantity):0;
          html+=`<tr>
            <td class="frz c1">${idx===0?fmtDate(sale.sale_date):''}</td>
            <td class="frz c2">${idx===0?`<span class="pill-tiny pill-sellable" style="text-transform:capitalize">${sale.platform}</span>`:''}</td>
            <td class="frz c3">${idx===0?(sale.customer_name||'—'):''}</td>
            <td>${item.quantity}</td>
            <td>${item.skus?item.skus.product_name+(item.skus.variant?' — '+item.skus.variant:''):'—'}</td>
            <td>${P(item.subtotal)}</td>
            <td>${P(lineCost)}</td>
            <td>${idx===0?P(sale.total_amount):''}</td>
            <td>${idx===0?P(sale.platform_fee):''}</td>
            <td>${idx===0?P(sale.shipping_fee):''}</td>
            <td>${idx===0?P(sale.net_profit):''}</td>
            <td>${idx===0?(sale.city_province||'—'):''}</td>
            <td>${idx===0?(sale.payment_method||'—'):''}</td>
            <td>${idx===0?(sale.notes||'—'):''}</td>
          </tr>`;
        });
      });
      html+=`</tbody></table></div>`;
    }
    $('body').innerHTML=html;
  }catch(e){
    $('body').innerHTML=`<div class="empty"><div class="empty-i">⚠️</div><p>Couldn't load sales log.<br><span class="t-muted" style="font-size:12px">${e.message}</span></p></div>`;
  }
}
