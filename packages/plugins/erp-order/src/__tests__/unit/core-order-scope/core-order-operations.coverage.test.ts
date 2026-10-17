import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DefinitionNode,
    FieldDefinitionNode,
    InputValueDefinitionNode,
    Kind,
    parse,
    TypeNode,
} from 'graphql';

import { CORE_ORDER_OPERATIONS } from '../../../core-order-scope/core-order-operations';

const ORDER_TYPES = new Set(['Order', 'OrderList', 'Payment', 'Fulfillment', 'Refund']);
const ORDER_ID_FIELDS = new Set(['orderId', 'orderLineId', 'paymentId', 'noteId']);

const schemaDir = join(dirname(require.resolve('@vendure/core/package.json')), 'dist/api/schema');

function definitions(dir: string): DefinitionNode[] {
    return readdirSync(dir)
        .filter(file => file.endsWith('.graphql'))
        .flatMap(file => parse(readFileSync(join(dir, file), 'utf8')).definitions);
}

const defs = [
    ...definitions(join(schemaDir, 'common')),
    ...definitions(join(schemaDir, 'admin-api')),
];

function namedType(type: TypeNode): string {
    return type.kind === Kind.NAMED_TYPE ? type.name.value : namedType(type.type);
}

const unions = new Map<string, string[]>();
const inputs = new Map<string, InputValueDefinitionNode[]>();
for (const def of defs) {
    if (def.kind === Kind.UNION_TYPE_DEFINITION) {
        unions.set(
            def.name.value,
            (def.types ?? []).map(t => t.name.value),
        );
    }
    if (
        def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
    ) {
        inputs.set(def.name.value, [...(inputs.get(def.name.value) ?? []), ...(def.fields ?? [])]);
    }
}

function returnsOrderData(field: FieldDefinitionNode): boolean {
    const type = namedType(field.type);
    return ORDER_TYPES.has(type) || (unions.get(type) ?? []).some(t => ORDER_TYPES.has(t));
}

function takesOrderId(
    args: readonly InputValueDefinitionNode[],
    seen = new Set<string>(),
): boolean {
    return args.some(arg => {
        if (ORDER_ID_FIELDS.has(arg.name.value)) return true;
        const type = namedType(arg.type);
        if (seen.has(type) || !inputs.has(type)) return false;
        seen.add(type);
        return takesOrderId(inputs.get(type) ?? [], seen);
    });
}

function orderOperations(): string[] {
    const found = new Set<string>();
    for (const def of defs) {
        if (def.kind !== Kind.OBJECT_TYPE_DEFINITION && def.kind !== Kind.OBJECT_TYPE_EXTENSION)
            continue;
        const root = def.name.value === 'Query' || def.name.value === 'Mutation';
        for (const field of def.fields ?? []) {
            const touches = returnsOrderData(field) || takesOrderId(field.arguments ?? []);
            if (!touches || ORDER_TYPES.has(def.name.value)) continue;
            found.add(root ? field.name.value : `${def.name.value}.${field.name.value}`);
        }
    }
    return [...found].sort();
}

describe('core Admin API order operations', () => {
    it('every core operation that takes or returns order data is covered by the scope guard', () => {
        const uncovered = orderOperations().filter(name => !(name in CORE_ORDER_OPERATIONS));
        expect(uncovered).toEqual([]);
    });

    it('the registry lists no operation core no longer has', () => {
        const known = new Set(
            defs.flatMap(def =>
                def.kind === Kind.OBJECT_TYPE_DEFINITION || def.kind === Kind.OBJECT_TYPE_EXTENSION
                    ? (def.fields ?? []).map(f =>
                          ['Query', 'Mutation'].includes(def.name.value)
                              ? f.name.value
                              : `${def.name.value}.${f.name.value}`,
                      )
                    : [],
            ),
        );
        expect(Object.keys(CORE_ORDER_OPERATIONS).filter(name => !known.has(name))).toEqual([]);
    });
});
