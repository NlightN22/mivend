import { describe, expect, it, vi } from 'vitest';

import { resolveRequestActor, type ActorLookups } from '../../change-journal-actor';

function lookups(acting: string | null, admin: string | null): ActorLookups {
    return {
        actingAdministratorId: vi.fn(async () => acting),
        administratorIdForUser: vi.fn(async () => admin),
    };
}

describe('resolveRequestActor', () => {
    it('no active user is the system actor', async () => {
        expect(await resolveRequestActor({ apiType: 'admin' }, lookups(null, '5'))).toEqual({
            actorType: 'system',
            userId: null,
            administratorId: null,
        });
    });

    it('an Admin API user is the administrator with both ids', async () => {
        expect(
            await resolveRequestActor({ apiType: 'admin', activeUserId: 3 }, lookups(null, '5')),
        ).toEqual({
            actorType: 'administrator',
            userId: '3',
            administratorId: '5',
        });
    });

    it('a Shop API user is the customer', async () => {
        const l = lookups(null, '5');
        expect(await resolveRequestActor({ apiType: 'shop', activeUserId: 9 }, l)).toEqual({
            actorType: 'customer',
            userId: '9',
            administratorId: null,
        });
        expect(l.administratorIdForUser).not.toHaveBeenCalled();
    });

    it('an acting session records the customer and the acting administrator', async () => {
        expect(
            await resolveRequestActor({ apiType: 'shop', activeUserId: 9 }, lookups('4', null)),
        ).toEqual({
            actorType: 'acting',
            userId: '9',
            administratorId: '4',
        });
    });

    it('a REST user without an administrator is a customer', async () => {
        expect(
            await resolveRequestActor({ apiType: 'custom', activeUserId: 9 }, lookups(null, null)),
        ).toMatchObject({
            actorType: 'customer',
        });
    });
});
