-- Inventory movement, step 1. ALREADY RUN in Supabase on Nov 19, 2026. Kept here as a record.
-- (Safe to run again: it only replaces functions and adds a column if it is missing.)
--
-- What this does:
--  1. skus.web_status: shown / unavailable (grayed out on the shop, has stock) / hidden
--  2. Sale deduction cuts from recipes automatically, records every step with a date,
--     and stops with a clear message if a recipe is broken
--  3. Take Order sales: stock records follow the sale date that was picked
--  4. deduct_member_order_stock: member orders use the same recipe logic, all or nothing
--  5. apply_inventory_adjustment and process_manual_cut accept a date
--  6. inventory_movement_month: feeds the Inventory Movement sheet
--
-- The full text of each function is stored in Supabase (Database > Functions).
-- Names and arguments:
--   process_sale_deduction(p_sku_id, p_quantity, p_sale_id, p_created_by, p_stock_date, p_allow_negative)
--   record_sale(...same as before..., uses p_sale_date as the stock date)
--   deduct_member_order_stock(p_sale_id, p_items jsonb, p_stock_date, p_created_by)
--   apply_inventory_adjustment(p_sku_id, p_txn_type, p_quantity_change, p_notes, p_created_by, p_stock_date)
--   process_manual_cut(p_finished_sku_id, p_num_cuts, p_created_by, p_stock_date)
--   inventory_movement_month(p_year, p_month) returns jsonb: starting counts + per-day totals

alter table public.skus add column if not exists web_status text not null default 'shown';
alter table public.skus drop constraint if exists skus_web_status_check;
alter table public.skus add constraint skus_web_status_check check (web_status in ('shown','unavailable','hidden'));
