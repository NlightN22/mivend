import { MigrationInterface, QueryRunner } from 'typeorm';

export class PickingWorkStages1791602000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" ADD "customFieldsPickingworkstages" text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "global_settings" DROP COLUMN "customFieldsPickingworkstages"`,
        );
    }
}
