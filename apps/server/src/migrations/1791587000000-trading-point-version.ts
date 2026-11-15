import { MigrationInterface, QueryRunner } from 'typeorm';

export class TradingPointVersion1791587000000 implements MigrationInterface {
    name = 'TradingPointVersion1791587000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "trading_point" ADD "version" integer NOT NULL DEFAULT 0`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trading_point" DROP COLUMN "version"`);
    }
}
