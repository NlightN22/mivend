import { describe, expect, it } from 'vitest';

import { classifySelectionFilter } from '../../selection-filter';
import { evaluateCounterpartyTerms, evaluateProductTerms } from '../../selection-filter-eval';
import type { ProductAttributes, RefResolution } from '../../selection-filter-eval';

const cond = (field: string, comparison: string, ...refs: string[]) => ({
    field,
    comparison,
    values: refs.map(refId => ({ refId })),
});
const MAKER = 'Номенклатура.Производитель';
const ITEM = 'Номенклатура';

const known: RefResolution = {
    manufacturers: new Set(['m1', 'm2']),
    categories: new Set(['root', 'leaf', 'other']),
    products: new Set(['p1', 'p2']),
};
const attrs = (over: Partial<ProductAttributes> = {}): ProductAttributes => ({
    productRef: 'p1',
    manufacturerRef: 'm1',
    categoryRefs: new Set(['leaf', 'root']),
    ...over,
});
const holds = (c: unknown, a = attrs(), k = known): boolean => {
    const { terms, reason } = classifySelectionFilter([c], 'product');
    expect(reason).toBeNull();
    return evaluateProductTerms(terms, a, k);
};

describe('classifySelectionFilter', () => {
    it('keeps the observed field and comparison set active', () => {
        for (const comparison of ['Равно', 'НеРавно', 'ВИерархии', 'НеВИерархии']) {
            expect(
                classifySelectionFilter([cond(ITEM, comparison, 'x')], 'product').reason,
            ).toBeNull();
        }
        for (const comparison of [
            'ВСписке',
            'НеВСписке',
            'ВСпискеПоИерархии',
            'НеВСпискеПоИерархии',
        ]) {
            expect(
                classifySelectionFilter([cond(MAKER, comparison, 'a', 'b')], 'product').reason,
            ).toBeNull();
        }
    });

    it('stores unknown shapes with an explicit reason', () => {
        const reason = (f: unknown[], side: 'product' | 'counterparty' = 'product') =>
            classifySelectionFilter(f, side).reason;
        expect(reason([cond('Поставщик', 'Равно', 'x')])).toBe('unknown-filter-field');
        expect(reason([cond(ITEM, 'Больше', 'x')])).toBe('unknown-comparison');
        expect(reason([cond('Контрагент', 'ВСпискеПоИерархии', 'x')], 'counterparty')).toBe(
            'unsupported-comparison',
        );
        expect(reason([cond('Контрагент', 'Равно', 'x')])).toBe('unknown-filter-field');
        expect(reason([{ field: ITEM, comparison: 'Равно', values: [{ stringValue: 'x' }] }])).toBe(
            'unknown-value-type',
        );
        expect(reason([cond(ITEM, 'Равно', 'a', 'b')])).toBe('invalid-values');
        expect(reason([cond(ITEM, 'ВСписке')])).toBe('invalid-values');
        expect(reason([])).toBe('empty-filter');
        expect(classifySelectionFilter(null, 'product').reason).toBe('empty-filter');
    });

    it('rejects the whole document when one of several terms is unknown', () => {
        const result = classifySelectionFilter(
            [cond(MAKER, 'Равно', 'm1'), cond(ITEM, 'Содержит', 'x')],
            'product',
        );
        expect(result).toEqual({ terms: [], reason: 'unknown-comparison' });
    });
});

describe('evaluateProductTerms', () => {
    it('matches manufacturer equals, in-list and their negations', () => {
        expect(holds(cond(MAKER, 'Равно', 'm1'))).toBe(true);
        expect(holds(cond(MAKER, 'Равно', 'm2'))).toBe(false);
        expect(holds(cond(MAKER, 'ВСписке', 'm2', 'm1'))).toBe(true);
        expect(holds(cond(MAKER, 'НеРавно', 'm2'))).toBe(true);
        expect(holds(cond(MAKER, 'НеРавно', 'm1'))).toBe(false);
        expect(holds(cond(MAKER, 'НеВСписке', 'm2'))).toBe(true);
        expect(holds(cond(MAKER, 'НеВСписке', 'm1', 'm2'))).toBe(false);
    });

    it('treats a product without a manufacturer as not equal', () => {
        const none = attrs({ manufacturerRef: null });
        expect(holds(cond(MAKER, 'Равно', 'm1'), none)).toBe(false);
        expect(holds(cond(MAKER, 'НеРавно', 'm1'), none)).toBe(true);
    });

    it('fails closed on an unsynced manufacturer, also negated and hierarchical', () => {
        expect(holds(cond(MAKER, 'Равно', 'ghost'))).toBe(false);
        expect(holds(cond(MAKER, 'НеРавно', 'ghost'))).toBe(false);
        expect(holds(cond(MAKER, 'НеВСписке', 'm2', 'ghost'))).toBe(false);
        expect(holds(cond(MAKER, 'ВСпискеПоИерархии', 'm1', 'ghost'))).toBe(false);
        expect(holds(cond(MAKER, 'ВСпискеПоИерархии', 'm1', 'm2'))).toBe(true);
    });

    it('matches an item equal to a listed product, but not a group by plain equality', () => {
        expect(holds(cond(ITEM, 'Равно', 'p1'))).toBe(true);
        expect(holds(cond(ITEM, 'Равно', 'p2'))).toBe(false);
        expect(holds(cond(ITEM, 'ВСписке', 'p2', 'p1'))).toBe(true);
        expect(holds(cond(ITEM, 'Равно', 'leaf'))).toBe(false);
        expect(holds(cond(ITEM, 'НеРавно', 'leaf'))).toBe(true);
    });

    it('matches hierarchy at any depth and for an item equal to a listed product', () => {
        expect(holds(cond(ITEM, 'ВИерархии', 'leaf'))).toBe(true);
        expect(holds(cond(ITEM, 'ВИерархии', 'root'))).toBe(true);
        expect(holds(cond(ITEM, 'ВИерархии', 'other'))).toBe(false);
        expect(holds(cond(ITEM, 'ВИерархии', 'p1'))).toBe(true);
        expect(holds(cond(ITEM, 'НеВИерархии', 'root'))).toBe(false);
        expect(holds(cond(ITEM, 'НеВИерархии', 'other'))).toBe(true);
    });

    it('handles mixed item and group lists', () => {
        expect(holds(cond(ITEM, 'ВСпискеПоИерархии', 'p2', 'root'))).toBe(true);
        expect(holds(cond(ITEM, 'ВСпискеПоИерархии', 'p2', 'other'))).toBe(false);
        expect(holds(cond(ITEM, 'ВСпискеПоИерархии', 'p1', 'other'))).toBe(true);
        expect(holds(cond(ITEM, 'НеВСпискеПоИерархии', 'p2', 'other'))).toBe(true);
        expect(holds(cond(ITEM, 'НеВСпискеПоИерархии', 'p2', 'root'))).toBe(false);
    });

    it('fails closed on an unresolved ref under a negated term only', () => {
        expect(holds(cond(ITEM, 'НеВИерархии', 'ghost'))).toBe(false);
        expect(holds(cond(ITEM, 'НеВСпискеПоИерархии', 'other', 'ghost'))).toBe(false);
        expect(holds(cond(ITEM, 'ВСпискеПоИерархии', 'ghost', 'root'))).toBe(true);
    });

    it('matches no category term for a product without a resolved category', () => {
        const orphan = attrs({ categoryRefs: new Set() });
        expect(holds(cond(ITEM, 'ВИерархии', 'root'), orphan)).toBe(false);
        expect(holds(cond(ITEM, 'НеВИерархии', 'root'), orphan)).toBe(true);
    });

    it('ANDs the terms and never matches an empty list', () => {
        const { terms } = classifySelectionFilter(
            [cond(MAKER, 'Равно', 'm1'), cond(ITEM, 'ВИерархии', 'other')],
            'product',
        );
        expect(evaluateProductTerms(terms, attrs(), known)).toBe(false);
        expect(evaluateProductTerms(terms.slice(0, 1), attrs(), known)).toBe(true);
        expect(evaluateProductTerms([], attrs(), known)).toBe(false);
    });
});

describe('evaluateCounterpartyTerms', () => {
    it('matches equals, in-list and negations by id', () => {
        const terms = (c: string, ...refs: string[]) =>
            classifySelectionFilter([cond('Контрагент', c, ...refs)], 'counterparty').terms;
        expect(evaluateCounterpartyTerms(terms('Равно', 'c1'), 'c1')).toBe(true);
        expect(evaluateCounterpartyTerms(terms('ВСписке', 'c2', 'c1'), 'c1')).toBe(true);
        expect(evaluateCounterpartyTerms(terms('Равно', 'c2'), 'c1')).toBe(false);
        expect(evaluateCounterpartyTerms(terms('НеРавно', 'c2'), 'c1')).toBe(true);
        expect(evaluateCounterpartyTerms([], 'c1')).toBe(false);
    });
});
