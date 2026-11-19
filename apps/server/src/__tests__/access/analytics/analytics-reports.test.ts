import { describe, expect, it } from 'vitest';

import { admin, staffToken } from '../harness/actors';
import type { ActorKey } from '../seed/fixture-plan';

const CATALOG = `query { analyticsReports { key title status note } }`;

async function reports(
    actor: ActorKey | 'superadmin',
): Promise<Array<{ key: string; status: string }>> {
    const result = await admin<{ analyticsReports: Array<{ key: string; status: string }> }>(
        await staffToken(actor),
        CATALOG,
    );
    expect(result.errors ?? []).toEqual([]);
    return result.data!.analyticsReports;
}

describe('analyticsReports access', () => {
    it.each<ActorKey | 'superadmin'>(['head-a', 'head-b', 'director', 'superadmin'])(
        '%s sees the catalog',
        async actor => {
            const list = await reports(actor);
            expect(list.length).toBeGreaterThan(0);
            expect(list.every(r => r.status === 'planned')).toBe(true);
        },
    );

    it.each<ActorKey>(['manager-a', 'manager-b', 'operator-a'])(
        '%s sees an empty catalog',
        async actor => {
            expect(await reports(actor)).toEqual([]);
        },
    );
});
