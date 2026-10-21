import { MigrationInterface, QueryRunner } from 'typeorm';

// #263: document PDFs moved from public assets to private storage named by uuid.
export class DocumentPrivatePdf1791532000000 implements MigrationInterface {
    name = 'DocumentPrivatePdf1791532000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "assetId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" ADD "assetId" character varying`);
    }
}
