import { describe, expect, it } from 'vitest';

import { classifyRule } from '../../retro-bonus-rule-classify';

const ref = (refId: string) => ({ refId });
const base = {
    counterpartyMode: 'list',
    allCounterparties: false,
    counterpartyFilter: null,
    productMode: 'list',
    allProducts: false,
    productFilter: null,
};

describe('classifyRule', () => {
    it('has no terms and no reason for list mode and for filter mode behind an all flag', () => {
        expect(classifyRule(base)).toEqual({ terms: [], inactiveReason: null });
        expect(classifyRule({ ...base, productMode: 'filter', allProducts: true })).toEqual({
            terms: [],
            inactiveReason: null,
        });
    });

    it('keeps an evaluable product and counterparty filter and returns both term sides', () => {
        const result = classifyRule({
            ...base,
            counterpartyMode: 'filter',
            counterpartyFilter: [{ field: 'Контрагент', comparison: 'Равно', values: [ref('c1')] }],
            productMode: 'filter',
            productFilter: [
                { field: 'Номенклатура', comparison: 'ВИерархии', values: [ref('g1')] },
            ],
        });
        expect(result.inactiveReason).toBeNull();
        expect(result.terms.map(t => t.side)).toEqual(['counterparty', 'product']);
    });

    it('names the unevaluable side and drops all terms', () => {
        const result = classifyRule({
            ...base,
            counterpartyMode: 'filter',
            counterpartyFilter: [
                { field: 'Контрагент', comparison: 'ВСпискеПоИерархии', values: [ref('g1')] },
            ],
            productMode: 'filter',
            productFilter: [{ field: 'Номенклатура', comparison: 'Равно', values: [ref('p1')] }],
        });
        expect(result).toEqual({
            terms: [],
            inactiveReason: 'counterparty-unsupported-comparison',
        });
        expect(classifyRule({ ...base, productMode: 'filter' }).inactiveReason).toBe(
            'product-empty-filter',
        );
    });
});
