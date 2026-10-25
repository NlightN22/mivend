import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_STREAMS = ['discount-rule', 'retro-bonus-rule'];
const BATCH = 50_000;

// #290: the removed per-row streams leave millions of inbox rows that no lane claims any more.
export class PurgeOldRuleStreams1791537000000 implements MigrationInterface {
    name = 'PurgeOldRuleStreams1791537000000';
    // Batches commit one by one; a single transaction over millions of rows would bloat and block.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (;;) {
            const [{ n }] = (await queryRunner.query(
                `WITH d AS (
                     DELETE FROM "integration_inbox_event" WHERE "id" IN (
                         SELECT "id" FROM "integration_inbox_event" WHERE "stream" = ANY($1) LIMIT ${BATCH}
                     ) RETURNING 1)
                 SELECT count(*)::int AS n FROM d`,
                [OLD_STREAMS],
            )) as Array<{ n: number }>;
            if (n === 0) return;
        }
    }

    public async down(): Promise<void> {
        // Deleted inbox rows are not restorable; nothing to undo.
    }
}
