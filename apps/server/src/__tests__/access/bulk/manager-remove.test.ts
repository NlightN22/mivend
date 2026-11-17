import { describe, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import { type ActorKey } from '../seed/fixture-plan';
import { idOf } from '../counterparty/counterparty-queries';

const OPERATION = 'counterparty-manager-remove';
const CATALOG = `query { bulkOperationCatalog { type } }`;
const PREVIEW = `mutation($t: String!, $p: JSON, $s: BulkSelectionInput!) { previewBulkBatch(type: $t, parameters: $p, selection: $s) { uuid } }`;

describe('bulk manager removal', () => {
    it.each(['operator-a', 'manager-a', 'head-a', 'head-b', 'head-default'] as ActorKey[])(
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
                p: { confirmed: true },
                s: { ids: [idOf('a-own')] },
            });
            expect(attempt.errors.join()).toMatch(DENIED);
        },
    );

    it('the general director sees the operation and must confirm the removal', async () => {
        const token = await staffToken('director');
        const catalog = await admin<{ bulkOperationCatalog: Array<{ type: string }> }>(
            token,
            CATALOG,
        );
        expect(catalog.data?.bulkOperationCatalog.map(o => o.type)).toContain(OPERATION);

        const unconfirmed = await admin(token, PREVIEW, {
            t: OPERATION,
            p: {},
            s: { ids: [idOf('a-own')] },
        });
        expect(unconfirmed.errors.join()).toMatch(/must be confirmed/);

        const confirmed = await admin(token, PREVIEW, {
            t: OPERATION,
            p: { confirmed: true },
            s: { ids: [idOf('a-own')] },
        });
        expect(confirmed.errors).toEqual([]);
    });
});
