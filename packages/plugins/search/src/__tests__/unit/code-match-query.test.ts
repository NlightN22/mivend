import type { ElasticSearchSortInput } from '@vendure/elasticsearch-plugin/lib/src/types';
import { describe, expect, it } from 'vitest';

import { CODE_FIELDS } from '../../code-index-fields';
import { mapSearchQuery, mapSearchSort } from '../../code-match-query';
import { HAS_ORGANIZATION_FIELD } from '../../sellable-filter';

const base = () => ({ bool: { filter: [{ term: { channelId: 1 } }] as unknown[] } });
const fieldsIn = (value: unknown): string[] =>
    [...JSON.stringify(value).matchAll(/"(product-\w+Normalized)"/g)].map(m => m[1]);

describe('mapSearchQuery', () => {
    it('keeps the sellable filter and filters of the base query for every search', () => {
        const group = mapSearchQuery(base(), { codeScope: { kind: 'sku', codes: ['a1'] } }, true);
        expect(group.bool.filter).toEqual([
            { term: { channelId: 1 } },
            { term: { [HAS_ORGANIZATION_FIELD]: true } },
        ]);
        const text = mapSearchQuery(base(), { term: 'oil' }, true);
        expect(text.bool.filter).toHaveLength(2);
    });

    it('does not restrict to sellable for the admin API', () => {
        expect(mapSearchQuery(base(), { term: 'oil' }, false).bool.filter).toHaveLength(1);
    });

    it('matches exact and prefix on the kind field, exact boosted', () => {
        const q = mapSearchQuery(base(), { codeScope: { kind: 'sku', codes: ['483855'] } }, false);
        expect(JSON.stringify(q.bool.must)).toContain(
            JSON.stringify({ term: { [CODE_FIELDS.sku]: { value: '483855', boost: 10 } } }),
        );
        expect(JSON.stringify(q.bool.must)).toContain(
            JSON.stringify({ prefix: { [CODE_FIELDS.sku]: { value: '483855' } } }),
        );
        expect(q.bool.must_not).toEqual([]);
    });

    it('excludes higher-priority kinds from each group (disjointness)', () => {
        const part = mapSearchQuery(
            base(),
            { codeScope: { kind: 'partNumber', codes: ['x1'] } },
            false,
        );
        expect(new Set(fieldsIn(part.bool.must_not))).toEqual(new Set([CODE_FIELDS.sku]));
        const oem = mapSearchQuery(
            base(),
            { codeScope: { kind: 'manufacturerCode', codes: ['x1'] } },
            false,
        );
        expect(new Set(fieldsIn(oem.bool.must_not))).toEqual(
            new Set([CODE_FIELDS.sku, CODE_FIELDS.partNumber]),
        );
        expect(new Set(fieldsIn(oem.bool.must))).toEqual(new Set([CODE_FIELDS.manufacturerCode]));
    });

    it('excludes every code match from the full-text items', () => {
        const q = mapSearchQuery(base(), { term: '48.3855 filter' }, false);
        expect(new Set(fieldsIn(q.bool.must_not))).toEqual(new Set(Object.values(CODE_FIELDS)));
        expect(JSON.stringify(q.bool.must_not)).toContain('"483855"');
        expect(JSON.stringify(q.bool.must)).toContain('48.3855 filter');
    });

    it('leaves a pure-text query without exclusions and an empty term unfiltered', () => {
        expect(mapSearchQuery(base(), { term: 'oil filter' }, false).bool.must_not).toBeUndefined();
        const empty = mapSearchQuery(base(), {}, false);
        expect(empty.bool.must).toBeUndefined();
    });
});

describe('mapSearchSort', () => {
    it('orders groups by relevance then id and leaves other sorts alone', () => {
        expect(mapSearchSort([], { codeScope: { kind: 'sku', codes: ['1'] } })).toEqual([
            { _score: { order: 'desc' } },
            { productId: { order: 'asc' } },
        ]);
        const sort: ElasticSearchSortInput = [{ 'productName.keyword': { order: 'asc' } }];
        expect(mapSearchSort(sort, { term: 'x' })).toBe(sort);
    });
});
