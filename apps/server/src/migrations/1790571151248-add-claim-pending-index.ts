import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClaimPendingIndex1790571151248 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "integration_inbox_event_claim_pending" ON "integration_inbox_event" ("stream", "eligible_at") WHERE "status" = 'pending'`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."integration_inbox_event_claim_pending"`,
            undefined,
        );
    }
}
