import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderErpReserveUntil1791596000000 implements MigrationInterface {
    name = 'OrderErpReserveUntil1791596000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsErpreserveuntil" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsErpreserveuntil"`,
        );
    }
}
