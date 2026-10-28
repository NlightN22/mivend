import { describe, expect, it } from 'vitest';
import { unevaluatedReason } from '../../retro-bonus-rule.service';
import type { RetroBonusRuleValues } from '../../retro-bonus-rule.service';

const rule = (over: Partial<RetroBonusRuleValues>): RetroBonusRuleValues =>
    ({
        allCounterparties: false,
        allProducts: false,
        counterpartyMode: 'list',
        productMode: 'list',
        ...over,
    }) as RetroBonusRuleValues;

describe('unevaluatedReason', () => {
    it('is null for list mode and for filter mode behind an all flag', () => {
        expect(unevaluatedReason(rule({}))).toBeNull();
        expect(unevaluatedReason(rule({ productMode: 'filter', allProducts: true }))).toBeNull();
    });

    it('names the filter dimension that is not evaluated', () => {
        expect(unevaluatedReason(rule({ counterpartyMode: 'filter' }))).toBe('counterparty-filter');
        expect(unevaluatedReason(rule({ productMode: 'filter' }))).toBe('product-filter');
    });
});
