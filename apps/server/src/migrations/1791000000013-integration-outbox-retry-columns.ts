import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationOutboxRetryColumns1791000000013 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" ADD "first_failed_at" TIMESTAMP WITH TIME ZONE`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" ADD "next_retry_at" TIMESTAMP WITH TIME ZONE`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" DROP COLUMN "next_retry_at"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_outbox" DROP COLUMN "first_failed_at"`,
            undefined,
        );
    }
}
