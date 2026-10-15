import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationErpHandedOverAt1791511000000 implements MigrationInterface {
    name = 'ReservationErpHandedOverAt1791511000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "reservation" ADD COLUMN IF NOT EXISTS "erpHandedOverAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "reservation" DROP COLUMN IF EXISTS "erpHandedOverAt"`,
        );
    }
}
