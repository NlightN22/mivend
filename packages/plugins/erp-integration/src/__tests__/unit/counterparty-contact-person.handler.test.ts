import { describe, expect, it, Mock, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CounterpartyContactStreamHandler } from '../../handlers/counterparty-contact.handler';

const ctx = {} as RequestContext;
interface SetupResult {
    handler: CounterpartyContactStreamHandler;
    persons: { upsert: Mock; deactivate: Mock };
}

function setup(counterparty: { id: number } | null): SetupResult {
    const repo = {
        findOne: vi.fn().mockResolvedValue(counterparty),
        create: vi.fn((v: unknown) => v),
        save: vi.fn(),
    };
    const persons = { upsert: vi.fn().mockResolvedValue(7), deactivate: vi.fn() };
    const handler = new CounterpartyContactStreamHandler(
        { getRepository: () => repo } as never,
        persons as never,
    );
    return { handler, persons };
}

describe('CounterpartyContactStreamHandler contact person', () => {
    const named = { counterpartyId: 'cp-1', name: 'Contact A', position: 'Buyer', isActive: true };

    it('upserts the person linked to a known counterparty', async () => {
        const { handler, persons } = setup({ id: 3 });
        await handler.apply(ctx, 'c-1', named);
        expect(persons.upsert).toHaveBeenCalledWith(ctx, 'c-1', {
            name: 'Contact A',
            position: 'Buyer',
            isActive: true,
            counterpartyId: 3,
        });
    });

    it('keeps the person unlinked for an unknown counterparty (linked when it arrives)', async () => {
        const { handler, persons } = setup(null);
        await handler.apply(ctx, 'c-1', named);
        expect(persons.upsert.mock.calls[0][2].counterpartyId).toBeNull();
    });

    it('deactivates the person on a tombstone', async () => {
        const { handler, persons } = setup({ id: 3 });
        await handler.apply(ctx, 'c-1', { isDeleted: true });
        expect(persons.deactivate).toHaveBeenCalledWith(ctx, 'c-1');
        expect(persons.upsert).not.toHaveBeenCalled();
    });
});
