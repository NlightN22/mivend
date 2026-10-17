import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationInboxClaimToken1791522000000 implements MigrationInterface {
    name = 'IntegrationInboxClaimToken1791522000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD COLUMN IF NOT EXISTS "claim_token" uuid`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN IF EXISTS "claim_token"`,
        );
    }
}
