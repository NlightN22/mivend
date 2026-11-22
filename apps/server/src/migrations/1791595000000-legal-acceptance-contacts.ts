import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegalAcceptanceContacts1791595000000 implements MigrationInterface {
    name = 'LegalAcceptanceContacts1791595000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "legal_acceptance" ADD "contactEmail" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "legal_acceptance" ADD "contactPhone" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "legal_acceptance" ADD "emailVerified" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "legal_acceptance" DROP COLUMN "emailVerified"`);
        await queryRunner.query(`ALTER TABLE "legal_acceptance" DROP COLUMN "contactPhone"`);
        await queryRunner.query(`ALTER TABLE "legal_acceptance" DROP COLUMN "contactEmail"`);
    }
}
