import { MigrationInterface, QueryRunner } from 'typeorm';

// #366: an undo restores each record's own previous state, so a record carries its input and what apply recorded.
export class BulkItemUndoData1791591000000 implements MigrationInterface {
    name = 'BulkItemUndoData1791591000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bulk_batch_item" ADD "input" jsonb`);
        await queryRunner.query(`ALTER TABLE "bulk_batch_item" ADD "undoData" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bulk_batch_item" DROP COLUMN "undoData"`);
        await queryRunner.query(`ALTER TABLE "bulk_batch_item" DROP COLUMN "input"`);
    }
}
