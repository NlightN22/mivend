import { describe, expect, it } from 'vitest';

import { admin, DENIED, seed, staffToken } from '../harness/actors';
import type { ActorKey } from '../seed/fixture-plan';

const CARD = `query($id: ID!) { managerCard(administratorId: $id) { administratorName } }`;

async function open(viewer: ActorKey, target: ActorKey): Promise<string | null> {
    const result = await admin<{ managerCard: { administratorName: string } | null }>(
        await staffToken(viewer),
        CARD,
        { id: seed().admins[target] },
    );
    expect(result.errors ?? []).toEqual([]);
    return result.data!.managerCard?.administratorName ?? null;
}

describe('managerCard access', () => {
    it.each<[ActorKey, ActorKey, boolean]>([
        ['manager-a', 'manager-a', true],
        ['manager-a', 'manager-b', false],
        ['head-a', 'manager-a', true],
        ['head-a', 'manager-b', false],
        ['head-b', 'manager-b', true],
        ['director', 'manager-a', true],
        ['director', 'manager-b', true],
    ])('%s opens the card of %s: %s', async (viewer, target, allowed) => {
        const name = await open(viewer, target);
        expect(name !== null).toBe(allowed);
    });

    it('denies the query to a role without ReadManagerCard', async () => {
        const result = await admin(await staffToken('operator-a'), CARD, {
            id: seed().admins['manager-a'],
        });
        expect(JSON.stringify(result.errors)).toMatch(DENIED);
    });
});
