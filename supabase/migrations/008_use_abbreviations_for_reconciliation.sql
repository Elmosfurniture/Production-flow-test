-- Reconciliation v2 — use products.abbreviations as the single source of truth.
--
-- Migration 007 introduced a separate product_aliases table, but the
-- products.abbreviations text-array column (added in migration 003) already
-- does the same job AND surfaces on the Products screen for manual editing.
-- Collapse to one mechanism:
--
--   • Drop product_aliases entirely (it was unused outside the reconciler).
--   • Re-flag every order that was imported via the new pipeline so the user
--     can re-reconcile from a clean slate. The previous round was
--     mis-clicked; abbreviations were never populated, so there is nothing
--     to preserve.
--
-- needs_review + original_item_code from migration 007 stay as-is.

drop table if exists product_aliases;

update orders
  set needs_review = true
  where original_item_code is not null;
