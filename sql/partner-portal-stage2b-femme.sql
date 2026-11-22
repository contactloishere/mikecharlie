-- Femme Cup variants: cup-alone items are now variants of the Femme Cup listing.
-- Tier variant values are ILIKE patterns. Applied as migration "partner_femme_variants_pricing".
update public.skus set variant='Regular with Pouch' where sku_code='FEMC-REGSET';
update public.skus set variant='Large with Pouch' where sku_code='FEMC-LRGSET';
update public.skus set product_name='Femme Cup', variant=case sku_code when 'FEMC-REG' then 'Regular Only (No Pouch)' else 'Large Only (No Pouch)' end where sku_code in ('FEMC-REG','FEMC-LRG');
delete from public.mcc_partner_price_tiers where product_name in ('Femme Cup','Femme Cup (No Pouch)');
insert into public.mcc_partner_price_tiers (product_name, variant, min_qty, unit_price) values ('Femme Cup','%with Pouch',20,100),('Femme Cup','%No Pouch%',10,75);
