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
- [ ] 2. DB: multiple payments per order, order revisions (revised invoices), custom line items, assorted lines
- [ ] 3. Partner shop page (partner-portal/shop-tab.js): cards, wholesale tiers, sets on top, price nudge
- [ ] 4. Variant picker: total first, tick variants / All, even split, Assorted, instructions box
- [ ] 5. Checkout: saved addresses (5 max), courier (SPX/J&T, LBC choice for Palawan), shipping + packing weight
- [ ] 6. Payment upload and invoice view
- [ ] 7. Home / Track my Order / History tabs, Request a change button
- [ ] 8. Admin Partner Clients tab: confirm payment, assign assorted variants, edit order, revised invoice, custom items, View as partner
- [ ] 9. Stock deduction when payment confirmed and variants assigned; Telegram alerts
- [ ] 10. Tests, then Lois says go live: merge to main

## Rules decided with Lois
- Sale price is the official price; wholesale tier applies at the minimum, below it the sale price
- Tier counts total pieces across variants of the same product
- Packing weight for partner orders only; hidden from partners
- No label design fee at checkout; custom line items only added by Lois on invoices
- Palawan customers choose SPX/J&T or LBC (LBC rates pending)
