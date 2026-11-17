import { buildSchema, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';

import { findOmittedTake } from '../../slow-request-log/omitted-take';
import { createOmittedTakeWarner } from '../../slow-request-log/omitted-take-warning';

const schema = buildSchema(`
    input ListOptions { take: Int, skip: Int }
    type Item { id: ID! }
    type ItemList { items: [Item!]!, totalItems: Int! }
    type Query {
        items(options: ListOptions): ItemList!
        item(id: ID!): Item
    }
`);

const find = (query: string, variables?: Record<string, unknown>): string[] =>
    findOmittedTake(schema, parse(query), variables);

describe('findOmittedTake', () => {
    it('flags a list field without options', () => {
        expect(find('{ items { totalItems } }')).toEqual(['items']);
    });

    it('flags options that carry no take', () => {
        expect(find('{ items(options: { skip: 5 }) { totalItems } }')).toEqual(['items']);
    });

    it('accepts a literal take, including take: 0', () => {
        expect(find('{ items(options: { take: 0 }) { totalItems } }')).toEqual([]);
        expect(find('{ items(options: { take: 20 }) { totalItems } }')).toEqual([]);
    });

    it('reads take from a variable bound to the whole options object', () => {
        const query = 'query Q($o: ListOptions) { items(options: $o) { totalItems } }';
        expect(find(query, { o: { take: 10 } })).toEqual([]);
        expect(find(query, { o: { skip: 1 } })).toEqual(['items']);
        expect(find(query, {})).toEqual(['items']);
    });

    it('reads take from a variable inside the options literal', () => {
        const query = 'query Q($t: Int) { items(options: { take: $t }) { totalItems } }';
        expect(find(query, { t: 0 })).toEqual([]);
        expect(find(query, {})).toEqual(['items']);
    });

    it('counts a variable default as take when the client omits the variable', () => {
        expect(
            find('query Q($t: Int = 20) { items(options: { take: $t }) { totalItems } }', {}),
        ).toEqual([]);
        expect(
            find(
                'query Q($o: ListOptions = { take: 20 }) { items(options: $o) { totalItems } }',
                {},
            ),
        ).toEqual([]);
    });

    it('ignores fields that are not paged lists', () => {
        expect(find('{ item(id: "1") { id } }')).toEqual([]);
    });
});

describe('createOmittedTakeWarner', () => {
    it('warns once per operation and field set', () => {
        const warn = vi.fn();
        const run = createOmittedTakeWarner(warn);
        const doc = parse('{ items { totalItems } }');
        run(schema, doc, undefined, 'Dash');
        run(schema, doc, undefined, 'Dash');
        run(schema, doc, undefined, 'Other');
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0]?.[0]).toContain('items in Dash');
    });

    it('reports the cap once instead of dropping silently', () => {
        const warn = vi.fn();
        const run = createOmittedTakeWarner(warn);
        const doc = parse('{ items { totalItems } }');
        for (let i = 0; i < 502; i++) run(schema, doc, undefined, `Op${i}`);
        expect(warn).toHaveBeenCalledTimes(501);
        expect(warn.mock.calls[500]?.[0]).toContain('capped');
    });

    it('stays silent when every list sets take', () => {
        const warn = vi.fn();
        createOmittedTakeWarner(warn)(
            schema,
            parse('{ items(options: { take: 0 }) { totalItems } }'),
            undefined,
            'Dash',
        );
        expect(warn).not.toHaveBeenCalled();
    });
});
