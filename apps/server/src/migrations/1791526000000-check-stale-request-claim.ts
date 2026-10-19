import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckStaleRequestClaim1791526000000 implements MigrationInterface {
    name = 'CheckStaleRequestClaim1791526000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "check_stale_request" ADD "claimedUntil" TIMESTAMP WITH TIME ZONE, ADD "claimToken" uuid`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "check_stale_request" DROP COLUMN "claimToken", DROP COLUMN "claimedUntil"`,
        );
    }
}
