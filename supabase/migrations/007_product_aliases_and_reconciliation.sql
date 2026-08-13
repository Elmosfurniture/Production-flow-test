-- Product reconciliation
--
-- Orders from the Access CSV use abbreviated product codes (e.g. "Ch-BowtieR",
-- "Tbl-Bordx23710076 KD") that don't match the codes we use in the app
-- ("KFC Bowtie Diner", etc.). Two changes here:
--
-- 1. product_aliases — confirmed mapping from a foreign code to a real product.
--    Once a user reconciles an Access code on the Reconcile screen, the alias
--    is stored here so future imports of the same code auto-link.
--
-- 2. orders.needs_review + orders.original_item_code — flags orders that came
--    in with an unmatched code so the Reconcile screen can list them. The raw
--    code is preserved separately because the importer still has to point
--    product_code at *some* products row (FK), so it auto-stubs one — but the
--    original code is needed for fuzzy matching.

create table if not exists product_aliases (
  id          uuid primary key default gen_random_uuid(),
  alias_code  text unique not null,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_aliases_product on product_aliases(product_id);

alter table orders
  add column if not exists needs_review       boolean not null default false,
  add column if not exists original_item_code text;

-- Partial index — only matters for the small subset of orders awaiting review.
create index if not exists idx_orders_needs_review
  on orders(needs_review) where needs_review = true;
