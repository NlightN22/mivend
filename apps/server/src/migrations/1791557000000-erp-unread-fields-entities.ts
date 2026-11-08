import { MigrationInterface, QueryRunner } from 'typeorm';

// #254: organization stock-control flag and settlement document accounting flags, stored as received.
export class ErpUnreadFieldsEntities1791557000000 implements MigrationInterface {
    name = 'ErpUnreadFieldsEntities1791557000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" ADD "controlsStock" boolean`,
        );
        await queryRunner.query(`ALTER TABLE "settlement_document" ADD "accounting" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_document" DROP COLUMN "accounting"`);
        await queryRunner.query(
            `ALTER TABLE "organization_requisites" DROP COLUMN "controlsStock"`,
        );
    }
}
