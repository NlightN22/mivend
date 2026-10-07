import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditLimitRecomputeColumns1791000000012 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "contract" ADD "effectiveCreditLimit" numeric(18,2)`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsDeferredordermaxagedays" integer DEFAULT '7'`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsDeferredordermaxagedays"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "contract" DROP COLUMN "effectiveCreditLimit"`,
            undefined,
        );
    }
}
