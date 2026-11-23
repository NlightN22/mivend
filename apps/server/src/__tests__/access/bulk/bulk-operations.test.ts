import { describe, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import { VISIBLE_COUNTERPARTIES, type ActorKey } from '../seed/fixture-plan';
import { ALL_KEYS, idOf } from '../counterparty/counterparty-queries';

const OPERATION = 'counterparty-portal-access';
const CATALOG = `query { bulkOperationCatalog { type } }`;
const PREVIEW = `mutation($t: String!, $p: JSON, $s: BulkSelectionInput!) { previewBulkBatch(type: $t, parameters: $p, selection: $s) { uuid number status totalCount } }`;
const RUN = `mutation($u: String!) { runBulkBatch(uuid: $u) { status } }`;
const ONE = `query($u: String!) { bulkBatch(uuid: $u) { uuid } }`;
const ITEMS = `query($u: String!) { bulkBatchItems(uuid: $u) { totalItems items { targetId } } }`;
const HISTORY = `query { bulkBatches(options: { take: 100 }) { totalItems } }`;

const NOT_HOLDERS: ActorKey[] = ['operator-a'];
const SCOPED_HOLDERS: ActorKey[] = ['manager-a', 'manager-b', 'head-a', 'head-b'];
const allIds = (): string[] => ALL_KEYS.map(idOf);
// Managers and heads hold the portal-access right; heads also the manager change.
const PORTAL_OPERATIONS = ['counterparty-portal-access', 'counterparty-password-reset'];
const HEAD_OPERATIONS = ['counterparty-manager-reassign', ...PORTAL_OPERATIONS];
const catalogOf = (key: ActorKey): string[] =>
    (key.startsWith('head-')
        ? HEAD_OPERATIONS
        : key.startsWith('manager-')
          ? PORTAL_OPERATIONS
          : []
    )
        .slice()
        .sort();

describe('bulk operations', () => {
    it.each(NOT_HOLDERS)(
        '%s does not hold the operation permission: no such operation in the catalog, no preview, empty history',
        async key => {
            const token = await staffToken(key);
            const catalog = await admin<{ bulkOperationCatalog: Array<{ type: string }> }>(
                token,
                CATALOG,
            );
            expect(catalog.errors).toEqual([]);
            expect(catalog.data?.bulkOperationCatalog.map(o => o.type).sort()).toEqual(
                catalogOf(key),
            );

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

    it.each(SCOPED_HOLDERS)(
        '%s holds the operations: the catalog lists them and the review covers only clients in scope',
        async key => {
            const token = await staffToken(key);
            const catalog = await admin<{ bulkOperationCatalog: Array<{ type: string }> }>(
                token,
                CATALOG,
            );
            expect(catalog.data?.bulkOperationCatalog.map(o => o.type).sort()).toEqual(
                catalogOf(key),
            );
            const preview = await admin<{ previewBulkBatch: { uuid: string } }>(token, PREVIEW, {
                t: OPERATION,
                p: { action: 'activate' },
                s: { ids: allIds() },
            });
            expect(preview.errors).toEqual([]);
            const items = await admin<{
                bulkBatchItems: { items: Array<{ targetId: string }> };
            }>(token, ITEMS, { u: preview.data!.previewBulkBatch.uuid });
            const own = new Set(VISIBLE_COUNTERPARTIES[key].map(idOf));
            const rows = items.data!.bulkBatchItems.items;
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) expect(own.has(row.targetId), row.targetId).toBe(true);
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
