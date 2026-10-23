import { MigrationInterface, QueryRunner } from 'typeorm';

// #263: a broadcast about an order is visible only to administrators who see that order.
export class NotificationOrderScope1791533000000 implements MigrationInterface {
    name = 'NotificationOrderScope1791533000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" ADD "orderId" character varying`);
        // Old order notices would stay visible to every branch: give them their order, drop the rest.
        await queryRunner.query(`UPDATE "notification" SET "orderId" = "sourceId"
            WHERE "sourceType" = 'point-confirmation-expired'`);
        await queryRunner.query(`UPDATE "notification" n SET "orderId" = r."orderId" FROM "reservation" r
            WHERE n."sourceType" IN ('reservation-intervention', 'reservation-erp-owned', 'reservation-rejected-release')
            AND r.id::text = n."sourceId"`);
        await queryRunner.query(`UPDATE "notification" SET "orderId" = NULLIF(split_part("sourceId", ':', 2), '')
            WHERE "sourceType" = 'reservation-reconciliation'`);
        await queryRunner.query(`UPDATE "notification" n SET "orderId" = p."orderId"::text FROM "proforma_invoice" p
            WHERE n."sourceType" = 'payment-reconciliation' AND p.id::text = split_part(n."sourceId", ':', 2)`);
        await queryRunner.query(`DELETE FROM "notification" WHERE "orderId" IS NULL AND "sourceType" IN
            ('point-confirmation-expired', 'reservation-intervention', 'reservation-erp-owned',
             'reservation-rejected-release', 'reservation-reconciliation')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "orderId"`);
    }
}
