-- #194: order cancel request fields. Idempotent; for contours that run with synchronize:true and
-- never execute migrations (same as migration 1791485000000-order-cancel-fields).
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsCancelrequestedat" TIMESTAMP;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsCancelreason" character varying(255);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsCancelrequeststatus" character varying(255);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsCancelrefusalreason" text;
