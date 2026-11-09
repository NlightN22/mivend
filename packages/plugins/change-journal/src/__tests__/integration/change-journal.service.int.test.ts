import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import type { ChangeJournalRecord } from '../../change-journal.types';
import { sweepChangeJournal } from '../../change-journal-cleanup.scheduled-task';
import { ChangeJournalService } from '../../change-journal.service';
import { insertJournalEntry } from '../../change-journal-write';
import { CHANGE_JOURNAL_DDL } from './change-journal-ddl';

const { schema, extra } = testSchemaOptions('change_journal_service');
let ds: DataSource;
let service: ChangeJournalService;
const ctx = testRequestContext;
const NOW = new Date('2026-11-09T12:00:00Z');
const DAY = 24 * 60 * 60_000;

function entry(overrides: Partial<ChangeJournalRecord>): ChangeJournalRecord {
    return {
        actorType: 'administrator',
        userId: '1',
        administratorId: '1',
        source: 'admin-api:test',
        requestId: null,
        sessionId: null,
        entityType: 'TradingPoint',
        entityId: '1',
        entityUuid: null,
        action: 'update',
        changes: {},
        occurredAt: NOW,
        ...overrides,
    };
}

async function insertAged(count: number, ageDays: number, entityId = 'old'): Promise<void> {
    for (let i = 0; i < count; i++) {
        await insertJournalEntry(
            ds,
            entry({ entityId, occurredAt: new Date(NOW.getTime() - ageDays * DAY - i * 1000) }),
        );
    }
}

const total = async (): Promise<number> =>
    ((await ds.query(`SELECT count(*)::int AS n FROM change_journal_entry`)) as { n: number }[])[0]
        .n;

beforeAll(async () => {
    await createTestSchema(schema);
    ds = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), schema, extra });
    await ds.initialize();
    await ds.query(CHANGE_JOURNAL_DDL);
    service = new ChangeJournalService(createTestConnection(ds));
});

afterAll(async () => {
    await ds?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await ds.query(`TRUNCATE change_journal_entry`);
});

describe('ChangeJournalService reads (real Postgres)', () => {
    it('lists one entity newest first with pagination and a total', async () => {
        for (let i = 0; i < 5; i++) {
            await insertJournalEntry(
                ds,
                entry({ occurredAt: new Date(NOW.getTime() + i * 1000), source: `s${i}` }),
            );
        }
        await insertJournalEntry(ds, entry({ entityId: '2' }));
        await insertJournalEntry(ds, entry({ entityType: 'Counterparty' }));
        const page = await service.findForEntity(ctx, 'TradingPoint', '1', { skip: 1, take: 2 });
        expect(page.totalItems).toBe(5);
        expect(page.items.map(i => i.source)).toEqual(['s3', 's2']);
        expect(page.items[0].occurredAt.toISOString()).toBe(
            new Date(NOW.getTime() + 3000).toISOString(),
        );
    });

    it('filters by actor, entity type and time, and caps take', async () => {
        await insertJournalEntry(
            ds,
            entry({ actorType: 'acting', administratorId: '4', userId: '9' }),
        );
        await insertJournalEntry(
            ds,
            entry({ actorType: 'system', userId: null, administratorId: null }),
        );
        await insertJournalEntry(
            ds,
            entry({ entityType: 'Order', occurredAt: new Date(NOW.getTime() - DAY) }),
        );
        expect((await service.findFiltered(ctx, { actorType: 'acting' }, {})).items).toHaveLength(
            1,
        );
        expect((await service.findFiltered(ctx, { administratorId: '4' }, {})).totalItems).toBe(1);
        expect((await service.findFiltered(ctx, { userId: '9' }, {})).totalItems).toBe(1);
        expect((await service.findFiltered(ctx, { entityType: 'Order' }, {})).totalItems).toBe(1);
        expect(
            (await service.findFiltered(ctx, { occurredAfter: new Date(NOW.getTime() - 1000) }, {}))
                .totalItems,
        ).toBe(2);
        expect((await service.findFiltered(ctx, { occurredBefore: NOW }, {})).totalItems).toBe(1);
        expect((await service.findFiltered(ctx, {}, { take: 1000 })).items).toHaveLength(3);
        expect(await service.findFiltered(ctx, {}, { take: 0 })).toEqual({
            items: [],
            totalItems: 3,
        });
    });
});

describe('change journal cleanup (real Postgres)', () => {
    it('one batch deletes at most the batch size and only rows past the cutoff', async () => {
        await insertAged(7, 400);
        await insertAged(3, 10, 'fresh');
        const cutoff = new Date(NOW.getTime() - 365 * DAY);
        expect(await service.deleteOlderThan(ctx, cutoff, 5)).toBe(5);
        expect(await total()).toBe(5);
    });

    it('a sweep removes every old row, keeps the fresh ones and is repeatable', async () => {
        await insertAged(12, 400);
        await insertAged(4, 364, 'fresh');
        expect(await sweepChangeJournal(service, ctx, 365, NOW, 5, 10)).toEqual({
            deleted: 12,
            batches: 3,
        });
        expect(await total()).toBe(4);
        expect(await sweepChangeJournal(service, ctx, 365, NOW, 5, 10)).toEqual({
            deleted: 0,
            batches: 1,
        });
        expect(await total()).toBe(4);
    });

    it('concurrent sweeps split the work: each old row is deleted once, nothing fails', async () => {
        await insertAged(60, 400);
        await insertAged(5, 1, 'fresh');
        const results = await Promise.all(
            Array.from({ length: 4 }, () => sweepChangeJournal(service, ctx, 365, NOW, 7, 100)),
        );
        expect(results.reduce((n, r) => n + r.deleted, 0)).toBe(60);
        expect(await total()).toBe(5);
    });

    it('a sweep running alongside new writes never deletes a fresh entry', async () => {
        await insertAged(30, 400);
        await Promise.all([
            sweepChangeJournal(service, ctx, 365, NOW, 4, 100),
            (async () => {
                for (let i = 0; i < 20; i++)
                    await insertJournalEntry(ds, entry({ entityId: 'new' }));
            })(),
        ]);
        expect(await total()).toBe(20);
    });
});
