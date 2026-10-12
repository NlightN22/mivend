import { migrateOrderLineIdentity } from '@mivend/plugin-order-identity';
import { MigrationInterface, QueryRunner } from 'typeorm';

// Line uuid moves out of OrderLine.customFields, which take part in Vendure's line merge (#221).
export class OrderLineIdentity1791487000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await migrateOrderLineIdentity(sql => queryRunner.query(sql));
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_line_custom_fields_uuid"`);
        await queryRunner.query(`ALTER TABLE "order_line" DROP COLUMN "customFieldsUuid"`);
    }

    // Merged duplicate lines are not split back.
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD "customFieldsUuid" character varying`,
        );
        await queryRunner.query(
            `UPDATE "order_line" ol SET "customFieldsUuid" = i."uuid"::text ` +
                `FROM "order_line_identity" i WHERE i."orderLineId" = ol."id"`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_order_line_custom_fields_uuid" ON "order_line" ("customFieldsUuid")`,
        );
        await queryRunner.query(`DROP TABLE "order_line_identity"`);
    }
}
