import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementDocumentInput } from '../../types';

let h: Harness;
const TZ = process.env.TZ;

const type = async (
    documentType: string,
    category: string,
    movesTurnover: boolean,
): Promise<void> => {
    await h.types.apply(ctx, {
        documentType,
        version: '2026-10-01T10:00:00Z',
        isDeleted: false,
        label: documentType,
        category,
        customerVisible: false,
        sortOrder: null,
    });
    await h.dataSource.query(
        `UPDATE settlement_document_type SET "movesTurnover" = $2 WHERE "documentType" = $1`,
        [documentType, movesTurnover],
    );
};

const doc = (
    erpId: string,
    documentType: string,
    date: string,
    amount: number,
    over: { cp?: string; isDeleted?: boolean; version?: string } = {},
): Promise<unknown> =>
    h.documents.apply(
        ctx,
        documentInput(erpId, {
            documentType,
            date: new Date(date),
            isDeleted: over.isDeleted ?? false,
            version: over.version ?? '2026-11-01T10:00:00Z',
            entries: [
                {
                    organizationErpId: 'org-1',
                    counterpartyErpId: over.cp ?? 'cp-1',
                    contractErpId: 'ct-1',
                    currency: 'RUB',
                    amount: amount / 100,
                    dueDate: null,
                    orderLinks: [],
                },
            ],
        } as Partial<SettlementDocumentInput>),
    );

const rows = (cp = 'cp-1'): Promise<{ day: string; turnover: number; docs: number }[]> =>
    h.dataSource
        .query(
            `SELECT to_char(day, 'YYYY-MM-DD') AS day, "turnoverMinor"::float AS turnover, "saleDocuments" AS docs
             FROM settlement_turnover_daily WHERE "counterpartyErpId" = $1 ORDER BY day`,
            [cp],
        )
        .then(r =>
            r.map((x: Record<string, number | string>) => ({
                ...x,
                turnover: Number(x.turnover),
                docs: Number(x.docs),
            })),
        );

beforeAll(async () => {
    process.env.TZ = 'UTC';
    h = await createHarness('turnover_rollup');
});

afterAll(async () => {
    if (TZ === undefined) delete process.env.TZ;
    else process.env.TZ = TZ;
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_turnover_daily, settlement_document_type RESTART IDENTITY CASCADE',
    );
    await type('Sale', 'sale', true);
    await type('Ret', 'return', true);
    await type('Pay', 'payment', false);
});

describe('settlement turnover rollup', () => {
    it('sums turnover documents per day and counts only sales documents', async () => {
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000);
        await doc('d2', 'Sale', '2026-11-03T15:00:00Z', 500);
        await doc('d3', 'Ret', '2026-11-03T16:00:00Z', -200);
        await doc('d4', 'Pay', '2026-11-03T17:00:00Z', -900);
        expect(await rows()).toEqual([{ day: '2026-11-03', turnover: 1300, docs: 2 }]);
    });

    it('moves a reposted document to its new day', async () => {
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000);
        await doc('d1', 'Sale', '2026-11-05T08:00:00Z', 1000, { version: '2026-11-02T10:00:00Z' });
        expect(await rows()).toEqual([{ day: '2026-11-05', turnover: 1000, docs: 1 }]);
    });

    it('drops a deleted document and clears the day', async () => {
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000);
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000, {
            isDeleted: true,
            version: '2026-11-02T10:00:00Z',
        });
        expect(await rows()).toEqual([]);
    });

    it('recomputes the previous counterparty when a repost changes it', async () => {
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000, { cp: 'cp-1' });
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000, {
            cp: 'cp-2',
            version: '2026-11-02T10:00:00Z',
        });
        expect(await rows('cp-1')).toEqual([]);
        expect(await rows('cp-2')).toEqual([{ day: '2026-11-03', turnover: 1000, docs: 1 }]);
    });

    it('keeps days whose documents were already removed by retention', async () => {
        await h.dataSource.query(
            `INSERT INTO settlement_turnover_daily VALUES ('cp-1', '2025-06-01', 'RUB', 777, 1)`,
        );
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000);
        expect(await rows()).toEqual([
            { day: '2025-06-01', turnover: 777, docs: 1 },
            { day: '2026-11-03', turnover: 1000, docs: 1 },
        ]);
    });

    it('rewrites only the days the applied document touches', async () => {
        await doc('d1', 'Sale', '2026-11-03T08:00:00Z', 1000);
        await doc('d2', 'Sale', '2026-11-05T08:00:00Z', 2000);
        await h.dataSource.query(
            `UPDATE settlement_turnover_daily SET "turnoverMinor" = 1 WHERE day = '2026-11-03'`,
        );
        await doc('d2', 'Sale', '2026-11-05T09:00:00Z', 3000, { version: '2026-11-05T09:00:00Z' });
        expect(await rows()).toEqual([
            { day: '2026-11-03', turnover: 1, docs: 1 },
            { day: '2026-11-05', turnover: 3000, docs: 1 },
        ]);
    });

    it('stays correct when two documents of one counterparty apply concurrently', async () => {
        await Promise.all(
            Array.from({ length: 6 }, (_, i) => doc(`c${i}`, 'Sale', '2026-11-03T08:00:00Z', 100)),
        );
        expect(await rows()).toEqual([{ day: '2026-11-03', turnover: 600, docs: 6 }]);
    });
});
