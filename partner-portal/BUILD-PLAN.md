# Partner Portal: build plan and resume notes (updated 2026-11-21)

How the build avoids stopping mid-way: every stage below is small, self-contained, committed and pushed (or applied to Supabase) before the next starts. State lives in the repo, Supabase and this doc, never only in a chat. A new session resumes at the first unchecked stage.

Repo: contactloishere/mikecharlie, branch partner-portal-signup (not merged, page not live). Shared code (shipping rates) was cherry-picked to main.
Supabase project: cdczxunygdmswgdzkbed. Telegram alerts via /api/notify-telegram.

## Done
- [x] Sign-up / log-in page (partner-portal/index.html, auth.js), partner tables, RLS, Telegram triggers
- [x] Menu renamed, /hotel-portal redirect, set prices on partner program page
- [x] Mini samplers in inventory (hidden from shop, visible in Take Orders), weights applied to all SKUs, cup-alone Femme Cups sellable
- [x] New SPX/J&T rate table (partials/shipping-rates.js), partnerPackingKg(): 0 / +0.4 / +0.7 kg
- [x] Table mcc_partner_price_tiers (wholesale tiers per product, pooled across variants)

## Next stages (one commit each)
- [x] 2. DB: server-side pricing (tiers, pooled across variants), multiple payments, invoice revisions, custom lines (admin only), assorted lines. See sql/partner-portal-stage2.sql. Tested with a rolled-back transaction.
- [x] 3. Dashboard shell (portal.js, tabs) + partner shop page (shop-tab.js): sets on top, product cards, wholesale tiers, running total, draft order saved per login. Table mcc_partner_sets added; server handles kind "set". (Price nudge goes with the picker in stage 4.)
- [x] 4. Variant picker (partner-portal/picker.js): total first, tick variants / All, even split, per-row edit with live counter, Assorted (not for products priced per variant group like Femme Cup), price nudge. Tested (20 checks, scratchpad pptest/pickertest.js).
- [x] 5. Checkout (partner-portal/checkout-tab.js): editable lines, saved addresses (5 max, save-for-next-time), region, courier (SPX/J&T; LBC offered only for Palawan, LBC fee is added later by Lois via a revised invoice until LBC rates are supplied), instructions box, totals with hidden packing weight, place order (browser sends only kinds, ids and qty; the database prices it). DB: LBC allowed for region palawan. Tested (27 checks, pptest/checkouttest.js).
- [x] 6. Payment tab (partner-portal/payment-tab.js): open orders with balance, invoice view incl. earlier versions, QR per method, part payments, screenshot upload to proof-of-payment bucket, rpc mcc_partner_submit_payment. ppInvoiceHtml() reusable for Track/History. Tested 18 checks (pptest/paytest.js)
- [x] 7. Home, Track my Order (steps placed/paid/preparing/packed/shipped/delivered, tracking box, Request a change via rpc mcc_partner_request_change + Telegram), History (invoice, Order again). Files home-tab.js, track-tab.js, history-tab.js. Stage ids used by admin in stage 8: placed, paid, preparing, packed, shipped, delivered; tracking jsonb {type,number,link}. Tests pptest/trackhometest.js (17).
- [ ] 8. Admin Partner Clients tab: confirm payment, assign assorted variants, edit order, revised invoice, custom items, View as partner
- [ ] 9. Stock deduction when payment confirmed and variants assigned; Telegram alerts
- [ ] 10. Tests, then Lois says go live: merge to main

## Rules decided with Lois
- Sale price is the official price; wholesale tier applies at the minimum, below it the sale price
- Tier counts total pieces across variants of the same product
- Packing weight for partner orders only; hidden from partners
- No label design fee at checkout; custom line items only added by Lois on invoices
- Palawan customers choose SPX/J&T or LBC (LBC rates pending)

## Notes from stage 2 (for later stages)
- Partner insert sends items as [{kind:'product',sku_id,qty}] or [{kind:'assorted',product_name,qty}]; the server fills names, prices and weights. Partners cannot send custom lines or change prices.
- Shipping fee is sent by the browser (rate table lives in JS); Lois sees every order before confirming payment. Packing weight (partnerPackingKg) is added in the browser before the rate lookup.
- Sets (the 4 bundles) are not handled by the server yet: add a mcc_partner_sets table in stage 3.
- Admin edits: update mcc_partner_orders.items / shipping_fee (and optionally revision_note). Total change auto-bumps invoice_rev and saves a row in mcc_partner_invoices. Assigning assorted variants does not change the total.
- Payments: partner calls mcc_partner_submit_payment(order, method, proof_url, amount); admin sets mcc_partner_payments.status to 'verified' or 'rejected'. pay_status: unpaid / proof_submitted / partial / paid.
- Stock deduction (stage 9) must run only when pay_status = 'paid' and variants_assigned and not stock_deducted. Editing items after stock_deducted needs special handling.

## Notes from stage 3
- The branch has unrelated git history to main (shallow clone). Do NOT merge it. Shared changes are cherry-picked to main; at go-live, copy partner-portal/, sql/ and the header change onto main as one commit.
- Current branch header links to /partner-portal; main still links to /hotel-portal (redirect to /partner-portal lives on the branch only).
- Femme Cup: one listing, 4 variants (Regular/Large with Pouch, Regular/Large Only (No Pouch)). Tier "variant" is an ILIKE pattern.
- Main already has: new shipping rates, partnerPackingKg, /partner-program rename, Hotel/Retail nav text. Set prices on main partial are 3100/1800/4400/2600 (branch copy of that partial is stale: do not copy it over).
- DB functions were changed through Supabase migrations (list_migrations is the source of truth for mcc_partner_order_compute).
- Draft order lines: {kind:'set',set_key,qty} | {kind:'product',sku_id,qty} | {kind:'assorted',product_name,qty}; saved in localStorage key mcc_partner_draft_<userId>.
- Test script: scratchpad pptest/shoptest.js (mocked Supabase).
