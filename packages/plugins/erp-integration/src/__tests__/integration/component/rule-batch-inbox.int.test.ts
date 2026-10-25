import { appendFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    CreateDateColumn,
    DataSource,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyDiscountRuleService } from '@mivend/plugin-price-entry';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { DiscountRuleStreamHandler } from '../../../handlers/discount-rule.handler';
import { RetroBonusRuleStreamHandler } from '../../../handlers/retro-bonus-rule.handler';
import { IntegrationInboxRetentionService } from '../../../integration-inbox-retention.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { InboundStream } from '../../../types';
import { makeInboxProcessor } from './inbox-processor-helpers';

@Entity('discount_rule')
@Index(['erpId'], { unique: true })
class TestDiscountRule {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) priceTypeCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'float', nullable: true }) minWeightKg!: number | null;
    @Column({ type: 'bigint', nullable: true }) minAmount!: number | null;
    @Column({ type: 'varchar', nullable: true }) triggerProductErpId!: string | null;
    @Column({ type: 'float', nullable: true }) triggerQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) giftProductErpId!: string | null;
    @Column({ type: 'float', nullable: true }) giftQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) operationKind!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientType!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) productErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) condition!: string | null;
    @Column({ type: 'float', nullable: true }) conditionValue!: number | null;
    @Column({ type: 'float' }) percent!: number;
    @Column({ type: 'float', nullable: true }) limitAmount!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar', nullable: true }) sourceVersion!: string | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
}

@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
class TestRetroRule {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) productErpId!: string;
    @Column({ type: 'varchar' }) counterpartyErpId!: string;
    @Column({ type: 'varchar', nullable: true }) recipientContractErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'boolean', default: false }) isInstant!: boolean;
    @Column({ type: 'varchar', nullable: true }) accrualPeriod!: string | null;
    @Column({ type: 'int', default: 0 }) accrualDayNumber!: number;
    @Column({ type: 'varchar' }) accrualKind!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'double precision', nullable: true }) limitAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionQuantity!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
}

const { schema, extra } = testSchemaOptions('erp_rule_batch');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let connection: TransactionalConnection;
let seq = 0;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, TestDiscountRule, TestRetroRule],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const mapped: Record<string, unknown> = {
        DiscountRule: TestDiscountRule,
        RetroBonusRule: TestRetroRule,
    };
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: { name?: string } | string) =>
            base.getRepository(
                c,
                ((typeof entity !== 'string' && mapped[entity.name ?? '']) || entity) as never,
            ),
    } as unknown as TransactionalConnection;
    inbox = new IntegrationInboxService(base);
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE integration_inbox_event, discount_rule, retro_bonus_rule RESTART IDENTITY`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const discountPayload = (
    version: string,
    o: Record<string, unknown> = {},
): Record<string, unknown> => ({
    percent: 5,
    isActive: true,
    condition: 'byQuantity',
    recipientId: 'cp-1',
    recipientType: 'counterparty',
    effectiveFrom: '2026-01-01T00:00:00Z',
    version,
    ...o,
});
const retroPayload = (
    version: string,
    o: Record<string, unknown> = {},
): Record<string, unknown> => ({
    counterpartyId: 'cp-1',
    productId: 'p-1',
    percent: 3,
    effectiveFrom: '2026-01-01T00:00:00Z',
    version,
    ...o,
});

async function enqueue(
    stream: InboundStream,
    entityId: string,
    version: string,
    payload: Record<string, unknown>,
    sourceEventId?: string,
): Promise<void> {
    seq += 1;
    await inbox.enqueue(testRequestContext, {
        stream,
        entityId,
        version,
        sourceEventId: sourceEventId ?? `evt-${seq}`,
        payload,
    });
}

function processor(batchMode: boolean) {
    const discount = new DiscountRuleStreamHandler(new CounterpartyDiscountRuleService(connection));
    const retro = new RetroBonusRuleStreamHandler(new RetroBonusRuleService(connection));
    const p = makeInboxProcessor(dataSource, inbox, vi.fn());
    const handlers = (p as unknown as { handlers: Record<string, unknown> }).handlers;
    const strip = (h: { apply: (...a: never[]) => unknown }): unknown => ({
        apply: h.apply.bind(h),
    });
    handlers['discount-rule'] = batchMode ? discount : strip(discount);
    handlers['retro-bonus-rule'] = batchMode ? retro : strip(retro);
    (p as unknown as { connection: unknown }).connection = connection;
    return p;
}

const statuses = async (): Promise<Array<{ status: string; outcome: string | null }>> =>
    dataSource.query(`SELECT status, outcome FROM integration_inbox_event ORDER BY id`);
const rules = (): Promise<
    Array<{ erpId: string; percent: number; active: boolean; sourceVersion: string }>
> =>
    dataSource.query(
        `SELECT "erpId", percent, active, "sourceVersion" FROM discount_rule ORDER BY "erpId"`,
    );

describe('batched discount-rule / retro-bonus-rule apply (real Postgres)', () => {
    it('applies a batch in one pass and marks every row processed', async () => {
        for (let i = 0; i < 20; i++)
            await enqueue(
                'discount-rule',
                `r${i}`,
                '1',
                discountPayload('1', { recipientId: `cp-${i}` }),
            );
        for (let i = 0; i < 20; i++)
            await enqueue('retro-bonus-rule', `b${i}`, '1', retroPayload('1'));

        const result = await processor(true).processPendingBatch(undefined, 100);

        expect(result).toMatchObject({ processed: 40, failed: 0 });
        expect(await rules()).toHaveLength(20);
        expect(await dataSource.query(`SELECT 1 FROM retro_bonus_rule`)).toHaveLength(20);
        expect(
            (await statuses()).every(s => s.status === 'processed' && s.outcome === 'applied'),
        ).toBe(true);
    });

    it('is idempotent: same entity and version with a different eventId changes nothing', async () => {
        await enqueue('retro-bonus-rule', 'b1', '4', retroPayload('4'));
        await processor(true).processPendingBatch();
        await enqueue('retro-bonus-rule', 'b1', '4', retroPayload('4', { percent: 99 }));
        await processor(true).processPendingBatch();

        const [row] = await dataSource.query(
            `SELECT percent, "sourceVersion" FROM retro_bonus_rule`,
        );
        expect(row).toEqual({ percent: 3, sourceVersion: '4' });
        expect(await dataSource.query(`SELECT 1 FROM retro_bonus_rule`)).toHaveLength(1);
    });

    it('orders several versions of one entity inside a batch (9 before 10)', async () => {
        await enqueue('discount-rule', 'r1', '10', discountPayload('10', { percent: 10 }));
        await enqueue('discount-rule', 'r1', '9', discountPayload('9', { percent: 9 }));

        await processor(true).processPendingBatch();

        expect(await rules()).toEqual([
            { erpId: 'r1', percent: 10, active: true, sourceVersion: '10' },
        ]);
    });

    it('marks a late lower version superseded against processed history', async () => {
        await enqueue('discount-rule', 'r1', '10', discountPayload('10'));
        await processor(true).processPendingBatch();
        await enqueue('discount-rule', 'r1', '9', discountPayload('9', { percent: 1 }));
        await processor(true).processPendingBatch();

        expect((await statuses()).map(s => s.outcome)).toEqual(['applied', 'superseded']);
        expect((await rules())[0].percent).toBe(5);
    });

    it('handles tombstone, inactive and unknown tombstone outcomes like the row path', async () => {
        await enqueue('discount-rule', 'r1', '1', discountPayload('1'));
        await processor(true).processPendingBatch();
        await enqueue('discount-rule', 'r1', '2', { isDeleted: true, version: '2' });
        await enqueue('discount-rule', 'ghost', '2', { isDeleted: true, version: '2' });
        await enqueue('discount-rule', 'off', '1', discountPayload('1', { isActive: false }));
        await processor(true).processPendingBatch();

        expect(await rules()).toEqual([
            { erpId: 'r1', percent: 5, active: false, sourceVersion: '2' },
        ]);
        const outcomes = await dataSource.query(
            `SELECT entity_id, outcome FROM integration_inbox_event ORDER BY id`,
        );
        expect(outcomes).toEqual([
            { entity_id: 'r1', outcome: 'applied' },
            { entity_id: 'r1', outcome: 'applied' },
            { entity_id: 'ghost', outcome: 'noop' },
            { entity_id: 'off', outcome: 'noop' },
        ]);
    });

    it('fails an invalid row visibly and still applies the rest of the batch', async () => {
        await enqueue('retro-bonus-rule', 'good', '1', retroPayload('1'));
        await enqueue('retro-bonus-rule', 'bad', '1', retroPayload('1', { counterpartyId: '' }));

        const result = await processor(true).processPendingBatch();

        expect(result).toMatchObject({ processed: 1, failed: 1 });
        const bad = await dataSource.query(
            `SELECT status, last_error FROM integration_inbox_event WHERE entity_id = 'bad'`,
        );
        expect(bad[0].status).toBe('failed');
        expect(bad[0].last_error).toContain('counterpartyId');
        expect(await dataSource.query(`SELECT 1 FROM retro_bonus_rule`)).toHaveLength(1);
    });

    it('rolls back a failing batch and retries row by row so one bad row does not fail the rest', async () => {
        await enqueue('retro-bonus-rule', 'a', '1', retroPayload('1'));
        await enqueue('retro-bonus-rule', 'b', '1', retroPayload('1'));
        const p = processor(true);
        const handlers = (
            p as unknown as {
                handlers: Record<
                    string,
                    {
                        applyBatch: unknown;
                        apply: (
                            c: RequestContext,
                            id: string,
                            pl: Record<string, unknown>,
                        ) => Promise<unknown>;
                    }
                >;
            }
        ).handlers;
        const realApply = handlers['retro-bonus-rule'].apply.bind(handlers['retro-bonus-rule']);
        handlers['retro-bonus-rule'].applyBatch = vi.fn().mockRejectedValue(new Error('boom'));
        handlers['retro-bonus-rule'].apply = async (c, id, pl) => {
            if (id === 'b') throw new Error('row b broken');
            return realApply(c, id, pl);
        };

        const result = await p.processPendingBatch();

        expect(result).toMatchObject({ processed: 1, failed: 1 });
        const rows = await dataSource.query(
            `SELECT entity_id, status FROM integration_inbox_event ORDER BY id`,
        );
        expect(rows).toEqual([
            { entity_id: 'a', status: 'processed' },
            { entity_id: 'b', status: 'pending' },
        ]);
        expect(await dataSource.query(`SELECT 1 FROM retro_bonus_rule`)).toHaveLength(1);
    });

    it('two workers on different versions of one entity end on the highest version', async () => {
        await enqueue('discount-rule', 'r1', '1', discountPayload('1', { percent: 1 }));
        await enqueue('discount-rule', 'r1', '2', discountPayload('2', { percent: 2 }));
        const a = processor(true).processPendingBatch(undefined, 1);
        const b = processor(true).processPendingBatch(undefined, 1);
        await Promise.all([a, b]);
        await processor(true).processPendingBatch();

        expect(await rules()).toEqual([
            { erpId: 'r1', percent: 2, active: true, sourceVersion: '2' },
        ]);
        expect((await statuses()).every(s => s.status === 'processed')).toBe(true);
    });

    it('keeps the conflict policy: a newer rule of the same scope supersedes the older one', async () => {
        await enqueue('discount-rule', 'a-old', '1', discountPayload('1'));
        await enqueue('discount-rule', 'b-new', '2', discountPayload('2', { percent: 7 }));
        await processor(true).processPendingBatch();

        expect(await rules()).toEqual([
            { erpId: 'a-old', percent: 5, active: false, sourceVersion: '1' },
            { erpId: 'b-new', percent: 7, active: true, sourceVersion: '2' },
        ]);
    });
});

describe('inbox retention overlap', () => {
    it('skips the sweep while another sweep holds the lock', async () => {
        await enqueue('retro-bonus-rule', 'b1', '1', retroPayload('1'));
        await enqueue('retro-bonus-rule', 'b1', '2', retroPayload('2'));
        await processor(true).processPendingBatch();
        const retention = new IntegrationInboxRetentionService(connection, {
            create: vi.fn().mockResolvedValue({}),
        } as never);
        const runner = dataSource.createQueryRunner();
        await runner.startTransaction();
        await runner.query(`select pg_advisory_xact_lock(hashtextextended('inbox-retention', 0))`);

        expect(await retention.purgeSupersededProcessedRows()).toBe(0);
        await runner.commitTransaction();
        await runner.release();
        expect(await retention.purgeSupersededProcessedRows()).toBe(1);
        expect(await retention.purgeSupersededProcessedRows()).toBe(0);
    });
});

describe('benchmark: row-by-row vs batch (prints events/s)', () => {
    const N = Number(process.env.RULE_BENCH_EVENTS ?? 2000);

    async function run(batchMode: boolean): Promise<number> {
        await dataSource.query(
            `TRUNCATE integration_inbox_event, retro_bonus_rule RESTART IDENTITY`,
        );
        await dataSource.query(
            `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, attempts)
             SELECT 'retro-bonus-rule', 'b' || g, '1', 'bench-' || g, $1::jsonb, 'pending', 0 FROM generate_series(1, $2) g`,
            [JSON.stringify(retroPayload('1')), N],
        );
        const p = processor(batchMode);
        const started = Date.now();
        for (;;) {
            const { claimed } = await p.processPendingBatch(['retro-bonus-rule'], 500);
            if (claimed === 0) break;
        }
        const perSecond = N / ((Date.now() - started) / 1000);
        expect(await dataSource.query(`SELECT 1 FROM retro_bonus_rule`)).toHaveLength(N);
        return perSecond;
    }

    it('batch path is much faster than the row path', async () => {
        const rowPath = await run(false);
        const batchPath = await run(true);
        const line = `[rule-batch-bench] N=${N} row-by-row=${rowPath.toFixed(0)}/s batch=${batchPath.toFixed(0)}/s speedup=${(batchPath / rowPath).toFixed(1)}x\n`;
        appendFileSync('/tmp/rule-batch-bench.txt', line);
        process.stderr.write(line);
        expect(batchPath).toBeGreaterThan(rowPath * 3);
    }, 300_000);
});
