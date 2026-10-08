import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxReplayRequested1791447802493 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" ADD "replay_requested_at" TIMESTAMP WITH TIME ZONE`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "integration_inbox_event" DROP COLUMN "replay_requested_at"`,
            undefined,
        );
    }
}
