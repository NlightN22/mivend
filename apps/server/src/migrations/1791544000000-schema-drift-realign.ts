import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-named and baseline-hash index names to the entity-derived ones (metadata-only renames).
const INDEX_RENAMES: Array<[string, string]> = [
    ['IDX_check_policy_uuid', 'IDX_faa2cf9d64c7cf1529043ef55c'],
    ['IDX_check_policy_history_uuid', 'IDX_7c005c755f48cc9f8fe4e400aa'],
    ['IDX_check_policy_history_policy', 'IDX_3d7cbc2c69a2ff231754adbc57'],
    ['IDX_check_result_uuid', 'IDX_c46575c100414c2eeaf938544e'],
    ['IDX_check_result_subject', 'IDX_ca6afa7f0f018a0c25f8ecbea4'],
    ['IDX_check_stale_request_uuid', 'IDX_0cd61e79027e1025abda0a3c2b'],
    ['IDX_check_stale_request_kind_key', 'IDX_2b348b6781bca8ec173fb26f2f'],
    ['IDX_order_status_history_entry_uuid', 'IDX_b43bc7d2cf4373156970076377'],
    ['IDX_order_status_history_entry_order', 'IDX_98b3124dda1e1d49737ab013df'],
    ['IDX_order_status_history_entry_order_time', 'IDX_3c5f58f5b591d8ce33f81da9a2'],
    ['IDX_discount_grant_uuid', 'IDX_47db7a63c3ee6dedfde6bdd4ad'],
    ['IDX_f494ce6746b91e9ec9562af485', 'IDX_3c05e04d59dc94393085b59337'],
    ['IDX_058ef835f99e28fc6717cd7c80', 'IDX_4329790dd0003c5c970aa729c0'],
    ['IDX_55c734c8f77040ed61ad02c6cd', 'IDX_54b478515751600782b459ebe8'],
    ['IDX_f6757552bd0776859af91c222c', 'IDX_595aee2281ace9b2a4fbd06328'],
    ['IDX_7465d595c3d205a1d09b71cb82', 'IDX_e16ed9eadfb67e95ec3659bd75'],
    ['IDX_invoice_uuid', 'IDX_7544ce1e72116109c9f66deb56'],
    ['IDX_c553baf9e321b2a8129d0a4fde', 'IDX_d2f99d5da80dcd0802eadcd1f6'],
    ['IDX_payment_attempt_uuid', 'IDX_ce4f7e39c121ca8005c28de81a'],
    ['IDX_payment_refund_uuid', 'IDX_b2b0d7ef0cbac69f536de98904'],
    ['IDX_payment_refund_number', 'IDX_35f1073b1752d50091538a67b1'],
    ['IDX_419e874af262dc90425c07aeee', 'IDX_f71ea5922db724609713b33db0'],
    ['IDX_settlement_entry_uuid', 'IDX_34a76fce9fc225ae8e206ff5de'],
    ['IDX_erp_order_reserve_uuid', 'IDX_5941da7a90298a8e8f8bc67a79'],
    ['IDX_erp_order_reserve_order', 'IDX_6504e1de225f3362f9ab4b593b'],
    ['IDX_erp_order_reserve_variant', 'IDX_ec489ba2fa3211c49fc298f845'],
    ['IDX_order_check_failure_uuid', 'IDX_a6573a83132ee4670ce75a0f0f'],
    ['IDX_order_check_failure_order', 'IDX_b3ed85b778fcaebcb0646f8e8b'],
    ['IDX_order_check_failure_created', 'IDX_1916639b3e97221c22f58340f8'],
    ['IDX_reservation_uuid', 'IDX_e78a5f9d802330e3f102c10369'],
    ['IDX_order_line_shortfall_uuid', 'IDX_55cec93df280f2493453236b43'],
    ['IDX_order_line_shortfall_order', 'IDX_0a57fc154733847c7906b44bc4'],
    ['IDX_order_line_shortfall_variant', 'IDX_e8ba2b5b8ffe51115fca6c6f21'],
    ['IDX_document_uuid', 'IDX_8960855240f8a386eed1d7791c'],
    ['IDX_stock_organization_entity_id', 'IDX_ff96383dd9e83a44b5cf95cc0f'],
    ['IDX_stock_organization_product_org', 'IDX_64b11e641c97aa1c59cc003531'],
    ['IDX_erp_reconciliation_issue_uuid', 'IDX_f4e482469efff702b0e82061f7'],
];

const FK_RENAMES: Array<[string, string, string]> = [
    [
        'settlement_document_entry',
        'FK_settlement_document_entry_document',
        'FK_d12b3f052455523bc47be63d466',
    ],
    ['settlement_order_link', 'FK_settlement_order_link_entry', 'FK_32006dc559952e51ad75f67c547'],
];

const ORDER_STRING_COLUMNS = [
    'customFieldsUuid',
    'customFieldsSelectedcontractid',
    'customFieldsErprejectionreasoncode',
    'customFieldsReservationfailurereason',
];

// Rename only when the source exists and the target does not, in the current schema (to_regclass uses the search path).
const renameIndex = (from: string, to: string): string =>
    `DO $$ BEGIN
       IF to_regclass('"${from}"') IS NOT NULL AND to_regclass('"${to}"') IS NULL
       THEN ALTER INDEX "${from}" RENAME TO "${to}"; END IF;
     END $$`;

const renameConstraint = (table: string, from: string, to: string): string =>
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${from}' AND conrelid = '"${table}"'::regclass)
       THEN ALTER TABLE "${table}" RENAME CONSTRAINT "${from}" TO "${to}"; END IF;
     END $$`;

export class SchemaDriftRealign1791544000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const [from, to] of INDEX_RENAMES) {
            await queryRunner.query(renameIndex(from, to));
        }
        for (const [table, from, to] of FK_RENAMES) {
            await queryRunner.query(renameConstraint(table, from, to));
        }
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_60284980bc8b9c624459948f4a"`);

        // Narrowing to varchar(255) rewrites the order table under an exclusive lock (see docs/deployment.md).
        await queryRunner.query(
            `ALTER TABLE "order" ${ORDER_STRING_COLUMNS.map(c => `ALTER COLUMN "${c}" TYPE character varying(255)`).join(', ')}`,
        );
        await queryRunner.query(
            `DO $$ BEGIN
               IF to_regclass('"IDX_order_custom_fields_uuid"') IS NOT NULL THEN
                 ALTER TABLE "order" ADD CONSTRAINT "UQ_83d503c1a18723712fd501c0bcf"
                   UNIQUE USING INDEX "IDX_order_custom_fields_uuid";
               END IF;
             END $$`,
        );
        await queryRunner.query(
            `DO $$ BEGIN
               IF to_regclass('"IDX_order_custom_fields_erporderid"') IS NOT NULL THEN
                 ALTER TABLE "order" ADD CONSTRAINT "UQ_05055a4988508bc8302aa785b0d"
                   UNIQUE ("customFieldsErporderid");
                 DROP INDEX "IDX_order_custom_fields_erporderid";
               END IF;
             END $$`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_custom_fields_erporderid"
               ON "order" ("customFieldsErporderid") WHERE "customFieldsErporderid" IS NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "UQ_05055a4988508bc8302aa785b0d"`,
        );
        await queryRunner.query(
            renameConstraint(
                'order',
                'UQ_83d503c1a18723712fd501c0bcf',
                'IDX_order_custom_fields_uuid',
            ),
        );
        await queryRunner.query(
            `ALTER TABLE "order" ${ORDER_STRING_COLUMNS.map(c => `ALTER COLUMN "${c}" TYPE character varying`).join(', ')}`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_60284980bc8b9c624459948f4a" ON "proforma_invoice" ("number")`,
        );
        for (const [table, from, to] of FK_RENAMES) {
            await queryRunner.query(renameConstraint(table, to, from));
        }
        for (const [from, to] of INDEX_RENAMES) {
            await queryRunner.query(renameIndex(to, from));
        }
    }
}
