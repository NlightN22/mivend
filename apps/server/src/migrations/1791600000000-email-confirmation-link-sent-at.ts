import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailConfirmationLinkSentAt1791600000000 implements MigrationInterface {
    name = 'EmailConfirmationLinkSentAt1791600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmation" ADD "linkSentAt" TIMESTAMPTZ`);
        await queryRunner.query(
            `UPDATE "email_confirmation" SET "linkSentAt" = now() WHERE "pendingEmail" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_confirmation" DROP COLUMN "linkSentAt"`);
    }
}
