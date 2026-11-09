import { passthroughGuard } from './contact-guard';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { CounterpartyContactStreamHandler } from '../../handlers/counterparty-contact.handler';

const ctx = {} as RequestContext;

function setup(counterparty: { id: number } | null) {
    const repo = {
        findOne: vi.fn().mockResolvedValue(counterparty),
        create: vi.fn((v: unknown) => v),
        save: vi.fn(),
    };
    const persons = { upsert: vi.fn().mockResolvedValue(7), deactivate: vi.fn() };
    const points = { guarded: passthroughGuard, replaceErpPoints: vi.fn() };
    const handler = new CounterpartyContactStreamHandler(
        { getRepository: () => repo } as never,
        persons as never,
        points as never,
    );
    return { handler, persons, points };
}

describe('CounterpartyContactStreamHandler contact person', () => {
    const named = { counterpartyId: 'cp-1', name: 'Contact A', position: 'Buyer', isActive: true };

    it('upserts the person linked to a known counterparty and replaces its channels', async () => {
        const { handler, persons, points } = setup({ id: 3 });
        await handler.apply(ctx, 'c-1', {
            ...named,
            contactInfos: [{ type: 'Телефон', presentation: '+7 912 345-67-89' }],
        });
        expect(persons.upsert).toHaveBeenCalledWith(ctx, 'c-1', {
            name: 'Contact A',
            position: 'Buyer',
            isActive: true,
            counterpartyId: 3,
        });
        expect(points.replaceErpPoints).toHaveBeenCalledWith(ctx, 'contactPerson', 7, [
            {
                type: 'phone',
                value: '+7 912 345-67-89',
                label: null,
                isPrimary: false,
                comment: null,
            },
        ]);
    });

    it('keeps the person unlinked for an unknown counterparty (linked when it arrives) and leaves channels alone without a list', async () => {
        const { handler, persons, points } = setup(null);
        await handler.apply(ctx, 'c-1', named);
        expect(persons.upsert.mock.calls[0][2].counterpartyId).toBeNull();
        expect(points.replaceErpPoints).not.toHaveBeenCalled();
    });

    it('deactivates the person on a tombstone and touches no channels', async () => {
        const { handler, persons, points } = setup({ id: 3 });
        await handler.apply(ctx, 'c-1', { isDeleted: true });
        expect(persons.deactivate).toHaveBeenCalledWith(ctx, 'c-1');
        expect(persons.upsert).not.toHaveBeenCalled();
        expect(points.replaceErpPoints).not.toHaveBeenCalled();
    });
});
