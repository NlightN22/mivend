import { describe, expect, it, Mock, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ContactPersonStreamHandler } from '../../handlers/contact-person.handler';
import { IndividualStreamHandler } from '../../handlers/individual.handler';
import { PersonalContactStreamHandler } from '../../handlers/personal-contact.handler';
import { MissingReferenceError } from '../../types';

const ctx = {} as RequestContext;
interface DepsResult {
    persons: { upsert: Mock; deactivate: Mock };
    args: [never, never];
}

function deps(
    counterparty: { id: number } | null = { id: 3 },
    deactivated: number | null = 5,
): DepsResult {
    const persons = {
        upsert: vi.fn().mockResolvedValue(7),
        deactivate: vi.fn().mockResolvedValue(deactivated),
    };
    const connection = {
        getRepository: () => ({ findOne: vi.fn().mockResolvedValue(counterparty) }),
    };
    return { persons, args: [connection, persons] as [never, never] };
}

describe('IndividualStreamHandler', () => {
    const named = { name: 'Person A', counterpartyId: 'cp-1', isActive: true };

    it('stores a non-group individual linked to its counterparty', async () => {
        const { persons, args } = deps();
        const outcome = await new IndividualStreamHandler(...args).apply(ctx, 'i-1', named);
        expect(outcome.kind).toBe('applied');
        expect(persons.upsert).toHaveBeenCalledWith(ctx, 'i-1', {
            name: 'Person A',
            position: null,
            isActive: true,
            counterpartyId: 3,
        });
    });

    it('ignores a group', async () => {
        const { persons, args } = deps();
        const outcome = await new IndividualStreamHandler(...args).apply(ctx, 'g-1', {
            ...named,
            isGroup: true,
        });
        expect(outcome.kind).toBe('noop');
        expect(persons.upsert).not.toHaveBeenCalled();
    });

    it('retries while the counterparty is unknown and stores nothing', async () => {
        const { persons, args } = deps(null);
        await expect(
            new IndividualStreamHandler(...args).apply(ctx, 'i-1', named),
        ).rejects.toBeInstanceOf(MissingReferenceError);
        expect(persons.upsert).not.toHaveBeenCalled();
    });

    it('stores an individual without a counterparty unlinked, without a lookup', async () => {
        const { persons, args } = deps(null);
        await new IndividualStreamHandler(...args).apply(ctx, 'i-1', {
            name: 'Person A',
            isActive: true,
        });
        expect(persons.upsert.mock.calls[0][2].counterpartyId).toBeNull();
    });

    it('a live event without any name is a noop, not a tombstone, and deactivates nothing', async () => {
        const { persons, args } = deps();
        const outcome = await new IndividualStreamHandler(...args).apply(ctx, 'i-1', {
            isActive: true,
        });
        expect(outcome.kind).toBe('noop');
        expect(persons.deactivate).not.toHaveBeenCalled();
        expect(persons.upsert).not.toHaveBeenCalled();
    });

    it('deactivates on a tombstone and reports an unknown person as a no-op', async () => {
        const known = deps();
        expect(
            (
                await new IndividualStreamHandler(...known.args).apply(ctx, 'i-1', {
                    isDeleted: true,
                })
            ).kind,
        ).toBe('applied');
        const unknown = deps(null, null);
        expect(
            (
                await new IndividualStreamHandler(...unknown.args).apply(ctx, 'i-1', {
                    isDeleted: true,
                })
            ).kind,
        ).toBe('noop');
        expect(unknown.persons.upsert).not.toHaveBeenCalled();
    });
});

describe.each([
    ['ContactPersonStreamHandler', ContactPersonStreamHandler],
    ['PersonalContactStreamHandler', PersonalContactStreamHandler],
])('%s', (_name, Handler) => {
    it('stores a person without an owner, composing the name from parts and keeping the description', async () => {
        const { persons, args } = deps();
        await new Handler(...args).apply(ctx, 'p-1', {
            lastName: 'Last',
            firstName: 'First',
            description: 'Buyer',
            isActive: true,
        });
        expect(persons.upsert).toHaveBeenCalledWith(ctx, 'p-1', {
            name: 'Last First',
            position: 'Buyer',
            isActive: true,
            counterpartyId: null,
        });
    });

    it('treats an absent isActive as inactive and a tombstone as deactivation', async () => {
        const { persons, args } = deps();
        await new Handler(...args).apply(ctx, 'p-1', { name: 'Person A' });
        expect(persons.upsert.mock.calls[0][2].isActive).toBe(false);
        const tomb = deps();
        await new Handler(...tomb.args).apply(ctx, 'p-1', { isDeleted: true });
        expect(tomb.persons.deactivate).toHaveBeenCalledWith(ctx, 'p-1');
        expect(tomb.persons.upsert).not.toHaveBeenCalled();
    });
});
