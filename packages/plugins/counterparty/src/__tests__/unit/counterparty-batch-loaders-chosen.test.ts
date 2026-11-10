import { describe, expect, it, vi } from 'vitest';

import { CounterpartyBatchLoaders } from '../../counterparty-batch-loaders.service';

describe('CounterpartyBatchLoaders.chosenContact', () => {
    it('returns an empty contact for a missing or non-numeric id without querying', async () => {
        const chosenContacts = vi.fn(async () => new Map());
        const loaders = new CounterpartyBatchLoaders(
            {} as never,
            {} as never,
            {
                chosenContacts,
            } as never,
        );
        const empty = { email: null, phone: null };
        expect(await loaders.chosenContact({} as never, undefined as never)).toEqual(empty);
        expect(await loaders.chosenContact({} as never, 'abc')).toEqual(empty);
        expect(chosenContacts).not.toHaveBeenCalled();
    });
});
