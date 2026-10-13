import { MigrationInterface, QueryRunner } from 'typeorm';

// #215: an external order whose lines referenced products not imported yet is flagged incomplete.
export class OrderExternalLinesIncomplete1791499000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order"
               ADD COLUMN IF NOT EXISTS "customFieldsExternallinesincomplete" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsExternallinesincomplete"`,
        );
    }
}
