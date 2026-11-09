import { MigrationInterface, QueryRunner } from 'typeorm';

// The orders list sorts NULLS LAST (shared list engine), which the plain btree on orderPlacedAt cannot serve.
export class OrderListSortIndexes1791571000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_placed_at_list"
               ON "order" ("orderPlacedAt" DESC NULLS LAST, "id" DESC)`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_order_created_at_list"
               ON "order" ("createdAt" DESC NULLS LAST, "id" DESC)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_placed_at_list"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_created_at_list"`);
    }
}
