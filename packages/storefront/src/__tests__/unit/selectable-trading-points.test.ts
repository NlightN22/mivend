import { describe, expect, it } from 'vitest';
import { selectableTradingPoints } from '../../pages/checkout/selectableTradingPoints';

describe('selectableTradingPoints', () => {
    it('drops inactive points and keeps the order of active ones', () =>
        expect(
            selectableTradingPoints([
                { id: '1', isActive: true },
                { id: '2', isActive: false },
                { id: '3', isActive: true },
            ]).map(p => p.id),
        ).toEqual(['1', '3']));
});
