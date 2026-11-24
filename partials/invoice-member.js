/* Plugs the member pages (account.html, checkout.html) into the shared invoice code (partials/invoice.js).
   An order is turned into the same shape the invoice drawing expects. Payment confirmed = paid. */
INV.known = {};
function mcInvoiceOrder(order, items) {
  const paid = ['payment_confirmed', 'preparing_order', 'shipped'].includes(order.current_stage);
  const o = {
    id: order.id,
    order_code: 'MO-' + String(order.id).slice(0, 8).toUpperCase(),
    created_at: order.created_at || new Date().toISOString(),
    business_name: order.customer_name,
    address: order.address, region_label: order.region_label, contact_number: order.contact_number,
    items: (items || []).map(i => ({ product_name: i.product_name, variant: i.variant, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total })),
    subtotal: order.subtotal, shipping_fee: order.shipping_fee, total: order.total,
    amount_paid: paid ? order.total : 0, pay_status: paid ? 'paid' : 'unpaid', invoice_rev: 1
  };
  INV.known[o.id] = o;
  return o;
}
INV.getOrder = async id => {
  // account page: rebuild from the latest loaded order, so a payment confirmed since opening shows as PAID
  if (typeof ACC !== 'undefined' && ACC.orders) {
    const ord = ACC.orders.find(x => x.id === id);
    if (ord) return mcInvoiceOrder(ord, (ACC.orderItemsByOrder || {})[id] || []);
  }
  return INV.known[id] || null;
};
