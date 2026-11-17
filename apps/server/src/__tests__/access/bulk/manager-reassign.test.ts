import { describe, expect, it } from 'vitest';

import { DENIED, admin, seed, staffToken } from '../harness/actors';
import { VISIBLE_COUNTERPARTIES, type ActorKey } from '../seed/fixture-plan';
import { ALL_KEYS, idOf } from '../counterparty/counterparty-queries';

const OPERATION = 'counterparty-manager-reassign';
const CATALOG = `query { bulkOperationCatalog { type } }`;
const PREVIEW = `mutation($t: String!, $p: JSON, $s: BulkSelectionInput!) { previewBulkBatch(type: $t, parameters: $p, selection: $s) { uuid } }`;
const ITEMS = `query($u: String!) { bulkBatchItems(uuid: $u) { items { targetId previewOutcome previewReasonCode } } }`;

interface Row {
    targetId: string;
    previewOutcome: string;
    previewReasonCode: string | null;
}

async function previewRows(key: ActorKey, target: string, ids: string[]): Promise<Row[]> {
    const token = await staffToken(key);
    const preview = await admin<{ previewBulkBatch: { uuid: string } }>(token, PREVIEW, {
        t: OPERATION,
        p: { administratorId: target },
        s: { ids },
    });
    expect(preview.errors).toEqual([]);
    const items = await admin<{ bulkBatchItems: { items: Row[] } }>(token, ITEMS, {
        u: preview.data!.previewBulkBatch.uuid,
    });
    return items.data!.bulkBatchItems.items;
}

describe('bulk manager reassignment', () => {
    it.each(['operator-a', 'manager-a', 'manager-b'] as ActorKey[])(
        '%s does not hold the right: no operation in the catalog, no preview',
        async key => {
            const token = await staffToken(key);
            const catalog = await admin<{ bulkOperationCatalog: Array<{ type: string }> }>(
                token,
                CATALOG,
            );
            expect(catalog.data?.bulkOperationCatalog.map(o => o.type)).not.toContain(OPERATION);
            const attempt = await admin(token, PREVIEW, {
                t: OPERATION,
                p: { administratorId: seed().admins[key] },
                s: { ids: [idOf('a-own')] },
            });
            expect(attempt.errors.join()).toMatch(DENIED);
        },
    );

    it.each(['head-a', 'head-b'] as ActorKey[])(
        '%s sees only clients of the own branch in the review, whatever the selection',
        async key => {
            const rows = await previewRows(key, seed().admins[key], ALL_KEYS.map(idOf));
            const own = new Set(VISIBLE_COUNTERPARTIES[key].map(idOf));
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) expect(own.has(row.targetId), row.targetId).toBe(true);
        },
    );

    it('a head cannot pick a manager of another branch as the target; the row says why', async () => {
        const rows = await previewRows(
            'head-a',
            seed().admins['head-b'],
            VISIBLE_COUNTERPARTIES['head-a'].map(idOf),
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row).toMatchObject({
                previewOutcome: 'skip',
                previewReasonCode: 'target_not_allowed',
            });
        }
    });
});
