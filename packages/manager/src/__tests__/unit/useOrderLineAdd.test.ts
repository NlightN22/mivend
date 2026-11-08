import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderLineAdd } from '../../composables/useOrderLineAdd';

const api = vi.hoisted(() => ({ search: vi.fn(), add: vi.fn() }));
vi.mock('../../api/orderLineEdit', () => ({
    searchVariantsBySku: api.search,
    addOrderLineBySku: api.add,
}));

const runner = async (action: () => Promise<void>): Promise<boolean> => {
    await action();
    return true;
};

describe('useOrderLineAdd', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not search for a query shorter than two characters', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        await add.search('a');
        expect(api.search).not.toHaveBeenCalled();
        expect(add.matches.value).toEqual([]);
    });

    it('keeps only the latest search result when answers arrive out of order', async () => {
        let release: (v: unknown) => void = () => undefined;
        api.search
            .mockImplementationOnce(() => new Promise(r => (release = r)))
            .mockResolvedValueOnce([{ id: '2', sku: 'AB-2', name: 'Two' }]);
        const add = useOrderLineAdd(() => '5', runner);
        const first = add.search('AB');
        await add.search('AB-');
        release([{ id: '1', sku: 'AB-1', name: 'One' }]);
        await first;
        expect(add.matches.value.map(m => m.sku)).toEqual(['AB-2']);
    });

    it('adds by the exact article through the shared runner and resets the input', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        add.query.value = 'AB-1';
        expect(await add.add('AB-1', 2)).toBe(true);
        expect(api.add).toHaveBeenCalledWith('5', 'AB-1', 2);
        expect(add.query.value).toBe('');
    });
});
