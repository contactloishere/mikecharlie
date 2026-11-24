/* Plugs the Partner Portal into the shared invoice code (partials/invoice.js) */
INV.lineLabel = i => ppLineLabel(i);
INV.getOrder = async id => {
  // always ask the server first, so the invoice shows the latest paid amount and any added charges
  let o = null;
  try { const r = await ppRest(`mcc_partner_orders?id=eq.${encodeURIComponent(id)}&select=*`); o = r && r[0]; } catch (e) { /* fall back to what we already have */ }
  if (!o) o = (typeof PAY !== 'undefined' ? PAY.orders : []).find(x => x.id === id);
  if (!o && typeof PP !== 'undefined' && PP.lastOrder && PP.lastOrder.id === id) o = PP.lastOrder;
  return o;
};
