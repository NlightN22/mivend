-- Renumbers existing Order/Invoice/PaymentAttempt/PaymentRefund/DiscountGrant rows onto
-- NumberingService's format (issue #207, docs/identifiers.md). Idempotent: a row already
-- matching the new format is left untouched, so re-running is a no-op.
--
-- Usage:
--   psql "$DATABASE_URL" -v instance_code=100 -f infrastructure/scripts/renumber-documents-207.sql
--
-- instance_code must be the exact 3-digit INSTANCE_NUMBER_CODE of the instance this database
-- belongs to (see .env.local.example / docs/environments.md). NEVER run this against a real
-- production contour without re-reading docs/identifiers.md's decision 1 first.

\set instance_code_lit '''' :instance_code ''''

-- Step 1: create the numbering sequences if this database's migrations never ran them
-- (local/staging-integration use synchronize:true, so TypeORM migrations never actually
-- execute here — see 1791470000000-numbering-sequences.ts, which this mirrors).
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_order START 1;
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_invoice START 1;
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_payment START 1;
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_refund START 1;
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_discount_grant START 1;
CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_proforma START 1;

-- Step 2: renumber "order".code. A row already in the new format (instance_code + 7+ digits,
-- no dash) is skipped, which makes a re-run a no-op.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM "order"
        WHERE NOT (code ~ ('^' || :instance_code_lit || '[0-9]{7,}$'))
        ORDER BY "createdAt" ASC
    LOOP
        UPDATE "order"
        SET code = :instance_code_lit || lpad(nextval('mivend_number_seq_order')::text, 7, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

-- Step 3: renumber invoice.number, order-scoped as "<order's NEW code>-NN". Must run after
-- step 2. Does NOT consume mivend_number_seq_invoice — Invoice numbers are order-scoped, not a
-- flat sequence (see InvoiceService.createUnderLock / docs/identifiers.md).
DO $$
DECLARE
    r RECORD;
    ordinal INT;
    current_order_id INT;
BEGIN
    current_order_id := NULL;
    ordinal := 0;
    FOR r IN
        SELECT i.id, i."orderId", o.code AS order_code
        FROM invoice i
        JOIN "order" o ON o.id = i."orderId"
        WHERE NOT (i.number ~ '^[0-9]+-[0-9]{2}$')
        ORDER BY i."orderId" ASC, i.id ASC
    LOOP
        IF current_order_id IS DISTINCT FROM r."orderId" THEN
            current_order_id := r."orderId";
            ordinal := 0;
        END IF;
        ordinal := ordinal + 1;
        UPDATE invoice
        SET number = r.order_code || '-' || lpad(ordinal::text, 2, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

-- Step 4: renumber payment_attempt.number, flat sequence.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM payment_attempt
        WHERE NOT (number ~ ('^' || :instance_code_lit || '[0-9]{7,}$'))
        ORDER BY "createdAt" ASC
    LOOP
        UPDATE payment_attempt
        SET number = :instance_code_lit || lpad(nextval('mivend_number_seq_payment')::text, 7, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

-- Step 5: renumber payment_refund.number, flat sequence. Also catches rows backfilled without
-- the instance-code prefix by migration 1791481000000-payment-refund-number.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM payment_refund
        WHERE NOT (number ~ ('^' || :instance_code_lit || '[0-9]{7,}$'))
        ORDER BY "createdAt" ASC
    LOOP
        UPDATE payment_refund
        SET number = :instance_code_lit || lpad(nextval('mivend_number_seq_refund')::text, 7, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

-- Step 6: renumber discount_grant.number, flat sequence.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM discount_grant
        WHERE NOT (number ~ ('^' || :instance_code_lit || '[0-9]{7,}$'))
        ORDER BY "createdAt" ASC
    LOOP
        UPDATE discount_grant
        SET number = :instance_code_lit || lpad(nextval('mivend_number_seq_discount_grant')::text, 7, '0')
        WHERE id = r.id;
    END LOOP;
END $$;
