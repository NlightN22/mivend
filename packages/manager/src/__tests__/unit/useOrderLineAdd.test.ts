import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrderLineAdd } from '../../composables/useOrderLineAdd';

const api = vi.hoisted(() => ({
    search: vi.fn(),
    add: vi.fn(),
    find: vi.fn(),
    limits: vi.fn(),
    adjust: vi.fn(),
}));
vi.mock('../../api/orderLineEdit', () => ({
    searchVariants: api.search,
    addOrderLineBySku: api.add,
    findOrderLineBySku: api.find,
}));
vi.mock('../../api/discountLimits', () => ({ fetchLineDiscountLimits: api.limits }));
vi.mock('../../api/priceAdjustment', () => ({ requestPriceAdjustment: api.adjust }));

const runner = async (action: () => Promise<void>): Promise<boolean> => {
    await action();
    return true;
};
const one = { id: '1', sku: 'AB-1', name: 'One' };

describe('useOrderLineAdd', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.find.mockResolvedValue({ id: '9', listPriceMinor: 10000, effectivePriceMinor: 10000 });
        api.limits.mockResolvedValue(new Map([['9', { max: 0, percent: 0 }]]));
        api.adjust.mockResolvedValue({ decision: 'apply-directly', approvalRequestId: null });
    });

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
        release([one]);
        await first;
        expect(add.matches.value.map(m => m.sku)).toEqual(['AB-2']);
    });

    it('asks to choose a product first', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        expect(await add.submit()).toBe(false);
        expect(add.error.value).toBe('Choose a product first');
        expect(api.add).not.toHaveBeenCalled();
    });

    it('adds the chosen article with the quantity and closes the row, no price call', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        add.quantity.value = 2;
        expect(await add.submit()).toBe(true);
        expect(api.add).toHaveBeenCalledWith('5', 'AB-1', 2);
        expect(api.adjust).not.toHaveBeenCalled();
        expect(add.open.value).toBe(false);
    });

    it('keeps the row open with the refusal inline', async () => {
        api.add.mockRejectedValueOnce(new Error('AB-1 has no price for this customer'));
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        expect(await add.submit()).toBe(false);
        expect(add.error.value).toContain('no price');
        expect(add.open.value).toBe(true);
        expect(api.adjust).not.toHaveBeenCalled();
    });

    it('applies an entered price to the new line through the price path', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        add.setPrice('90');
        await add.submit();
        expect(api.adjust).toHaveBeenCalledWith('5', '9', 9000);
    });

    it('converts an entered percent from the new line reference price', async () => {
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        add.setDiscount('10');
        await add.submit();
        expect(api.adjust).toHaveBeenCalledWith('5', '9', 9000);
    });

    it('typing one of price and discount clears the other', () => {
        const add = useOrderLineAdd(() => '5', runner);
        add.setPrice('90');
        add.setDiscount('5');
        expect(add.price.value).toBe('');
        add.setPrice('80');
        expect(add.discount.value).toBe('');
    });

    it('reports a price that needs approval, the line stays added', async () => {
        api.adjust.mockResolvedValueOnce({ decision: 'requires-approval', approvalRequestId: '3' });
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        add.setPrice('50');
        expect(await add.submit()).toBe(true);
        expect(add.notice.value).toContain('sent for approval');
    });

    it('tells the manager when the price was not applied after the line was added', async () => {
        api.adjust.mockRejectedValueOnce(new Error('below the floor'));
        const add = useOrderLineAdd(() => '5', runner);
        add.begin();
        add.pick(one);
        add.setPrice('1');
        expect(await add.submit()).toBe(true);
        expect(add.notice.value).toContain('AB-1 added, but the price was not applied');
        expect(add.open.value).toBe(false);
    });
});
