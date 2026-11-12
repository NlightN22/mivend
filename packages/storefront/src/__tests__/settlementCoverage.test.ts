import { describe, expect, it } from 'vitest';

import { unexplainedByCurrency } from '../pages/settlements/settlementCoverage';

const card = (currency: string, unexplained: number) => ({ currency, unexplained });

describe('unexplainedByCurrency', () => {
    it('sums the cards of one currency', () => {
        expect(unexplainedByCurrency([card('RUB', 5000), card('RUB', 2500)])).toEqual([
            { currency: 'RUB', unexplained: 7500 },
        ]);
    });

    it('hides a currency below one currency unit', () => {
        expect(unexplainedByCurrency([card('RUB', 99), card('RUB', 0)])).toEqual([]);
    });

    it('shows a currency at exactly one unit', () => {
        expect(unexplainedByCurrency([card('RUB', 100)])).toHaveLength(1);
    });

    it('keeps currencies apart', () => {
        expect(unexplainedByCurrency([card('RUB', 5000), card('USD', 10)])).toEqual([
            { currency: 'RUB', unexplained: 5000 },
        ]);
    });

    it('reports negative gaps and lets opposite cards offset', () => {
        expect(unexplainedByCurrency([card('RUB', -5000)])).toEqual([
            { currency: 'RUB', unexplained: -5000 },
        ]);
        expect(unexplainedByCurrency([card('RUB', 5000), card('RUB', -4950)])).toEqual([]);
    });
});
