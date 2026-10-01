-- "Currently working on" flag for list items. Any number of items in a list
-- can be in progress at once. Idempotent, like 0000_init.sql.
ALTER TABLE "list_item"
  ADD COLUMN IF NOT EXISTS "in_progress" boolean NOT NULL DEFAULT false;
