import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderUuid1791460000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD "customFieldsUuid" character varying`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "order_line" ADD "customFieldsUuid" character varying`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "order" SET "customFieldsUuid" = gen_random_uuid() WHERE "customFieldsUuid" IS NULL`,
            undefined,
        );
        await queryRunner.query(
            `UPDATE "order_line" SET "customFieldsUuid" = gen_random_uuid() WHERE "customFieldsUuid" IS NULL`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_order_custom_fields_uuid" ON "order" ("customFieldsUuid")`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_order_line_custom_fields_uuid" ON "order_line" ("customFieldsUuid")`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_order_line_custom_fields_uuid"`, undefined);
        await queryRunner.query(`DROP INDEX "IDX_order_custom_fields_uuid"`, undefined);
        await queryRunner.query(
            `ALTER TABLE "order_line" DROP COLUMN "customFieldsUuid"`,
            undefined,
        );
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUuid"`, undefined);
    }
}
