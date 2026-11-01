import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxDependencyMissing1791546000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "integration_inbox_event"
                SET "status" = 'dependency_missing',
                    "next_retry_at" = now() + ("id" % 1440) * interval '1 minute',
                    "eligible_at" = now() + ("id" % 1440) * interval '1 minute'
              WHERE "status" = 'failed'
                AND (("stream" IN ('contract', 'point-of-sale') AND "last_error" LIKE '%counterparty erpId=% not synced yet')
                  OR ("stream" = 'product-photo' AND "last_error" LIKE 'product % not imported yet')
                  OR ("stream" = 'price' AND "last_error" LIKE '%no PriceType found for priceTypeId=%')
                  OR ("stream" = 'stock' AND ("last_error" LIKE '%no Warehouse found for warehouseId=%'
                    OR "last_error" LIKE '%no StockLocation found for warehouseId=%'
                    OR "last_error" LIKE '%variant not found for productId=%'))
                  OR ("stream" = 'storage-location' AND ("last_error" LIKE '%variant not found for productId=%'
                    OR "last_error" LIKE '%no OrganizationRequisites found for %')))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "integration_inbox_event" SET "status" = 'failed', "next_retry_at" = NULL
              WHERE "status" = 'dependency_missing'`,
        );
    }
}
