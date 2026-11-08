import { describe, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import type { ActorKey } from '../seed/fixture-plan';
import { ALL_KEYS, idOf } from '../counterparty/counterparty-queries';

const OPERATION = 'counterparty-portal-access';
const CATALOG = `query { bulkOperationCatalog { type } }`;
const PREVIEW = `mutation($t: String!, $p: JSON, $s: BulkSelectionInput!) { previewBulkBatch(type: $t, parameters: $p, selection: $s) { uuid number status totalCount } }`;
const RUN = `mutation($u: String!) { runBulkBatch(uuid: $u) { status } }`;
const ONE = `query($u: String!) { bulkBatch(uuid: $u) { uuid } }`;
const ITEMS = `query($u: String!) { bulkBatchItems(uuid: $u) { totalItems items { targetId } } }`;
const HISTORY = `query { bulkBatches(options: { take: 100 }) { totalItems } }`;

const NOT_HOLDERS: ActorKey[] = ['manager-a', 'manager-b', 'head-a', 'head-b', 'operator-a'];
const allIds = (): string[] => ALL_KEYS.map(idOf);

describe('bulk operations', () => {
    it.each(NOT_HOLDERS)(
        '%s does not hold the operation permission: empty catalog, no preview, empty history',
        async key => {
            const token = await staffToken(key);
            const catalog = await admin<{ bulkOperationCatalog: unknown[] }>(token, CATALOG);
            expect(catalog.errors).toEqual([]);
            expect(catalog.data?.bulkOperationCatalog).toEqual([]);

            const attempt = await admin(token, PREVIEW, {
                t: OPERATION,
                p: { action: 'activate' },
                s: { ids: allIds() },
            });
            expect(attempt.errors.join()).toMatch(DENIED);
            expect(attempt.data).toBeNull();

            const history = await admin<{ bulkBatches: { totalItems: number } }>(token, HISTORY);
            expect(history.data?.bulkBatches.totalItems).toBe(0);
        },
    );

    it('a holder sees the operation; a draft and its rows belong to its creator', async () => {
        const [director, superadmin] = [
            await staffToken('director'),
            await staffToken('superadmin'),
        ];
        const catalog = await admin<{ bulkOperationCatalog: Array<{ type: string }> }>(
            director,
            CATALOG,
        );
        expect(catalog.data?.bulkOperationCatalog.map(o => o.type)).toContain(OPERATION);

        const preview = await admin<{ previewBulkBatch: { uuid: string; totalCount: number } }>(
            director,
            PREVIEW,
            { t: OPERATION, p: { action: 'activate' }, s: { ids: allIds() } },
        );
        expect(preview.errors).toEqual([]);
        const { uuid, totalCount } = preview.data!.previewBulkBatch;
        expect(totalCount, 'scope all sees every selected record').toBe(ALL_KEYS.length);

        const items = await admin<{ bulkBatchItems: { totalItems: number } }>(director, ITEMS, {
            u: uuid,
        });
        expect(items.data?.bulkBatchItems.totalItems).toBe(ALL_KEYS.length);

        for (const [name, query] of [
            ['read', ONE],
            ['rows', ITEMS],
            ['run', RUN],
        ] as const) {
            const other = await admin(superadmin, query, { u: uuid });
            expect(
                other.errors.length,
                `another holder cannot ${name} someone else's draft`,
            ).toBeGreaterThan(0);
            expect(other.data).toBeNull();
        }

        const history = await admin<{ bulkBatches: { totalItems: number } }>(director, HISTORY);
        expect(history.data?.bulkBatches.totalItems, 'a draft is not history').toBe(0);
    });

    it('rejects an unknown operation, a bad parameter and an empty selection with nothing created', async () => {
        const director = await staffToken('director');
        for (const variables of [
            { t: 'no-such-operation', p: {}, s: { ids: ['1'] } },
            { t: OPERATION, p: { action: 'explode' }, s: { ids: ['1'] } },
            { t: OPERATION, p: { action: 'activate' }, s: { ids: [] } },
        ]) {
            const attempt = await admin(director, PREVIEW, variables);
            expect(attempt.errors.length).toBeGreaterThan(0);
            expect(attempt.data).toBeNull();
        }
    });
});
