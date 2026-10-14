import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpRejectionReasonText1791508000000 implements MigrationInterface {
    name = 'ErpRejectionReasonText1791508000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ALTER COLUMN "customFieldsErprejectionreasontext" TYPE text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ALTER COLUMN "customFieldsErprejectionreasontext" TYPE character varying(255) USING left("customFieldsErprejectionreasontext", 255)`,
        );
    }
}
