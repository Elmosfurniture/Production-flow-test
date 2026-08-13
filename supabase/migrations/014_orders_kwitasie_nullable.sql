-- ============================================================
-- Migration 014 — Allow kwitasie_nr to be null.
--
-- kwitasie_nr is only meaningful for orders imported from the Access CSV
-- (it's Access's auto-number, used to dedupe import runs). Orders created
-- manually in the app don't have one — the user identifies their order by
-- ord_nr instead.
--
-- We drop the NOT NULL constraint but keep the UNIQUE constraint. Postgres
-- allows multiple NULL values in a UNIQUE column by default, so manual
-- orders can coexist freely while CSV imports still get dedup'd by
-- Access's number.
-- ============================================================

alter table orders alter column kwitasie_nr drop not null;
