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

const ORDER_TYPES = new Set([
    'Order',
    'OrderList',
    'OrderLine',
    'Payment',
    'Fulfillment',
    'Refund',
]);
const ORDER_ID_FIELDS = new Set(['orderId', 'orderLineId', 'paymentId', 'noteId']);
const ROOTS = ['Query', 'Mutation'];

const schemaDir = join(dirname(require.resolve('@vendure/core/package.json')), 'dist/api/schema');
const defs: DefinitionNode[] = ['common', 'admin-api'].flatMap(sub =>
    readdirSync(join(schemaDir, sub))
        .filter(file => file.endsWith('.graphql'))
        .flatMap(file => parse(readFileSync(join(schemaDir, sub, file), 'utf8')).definitions),
);

const fields = new Map<string, FieldDefinitionNode[]>();
const inputs = new Map<string, InputValueDefinitionNode[]>();
const members = new Map<string, string[]>();
const addMember = (owner: string, member: string): void => {
    members.set(owner, [...(members.get(owner) ?? []), member]);
};
for (const def of defs) {
    switch (def.kind) {
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
        case Kind.INTERFACE_TYPE_DEFINITION:
            fields.set(def.name.value, [
                ...(fields.get(def.name.value) ?? []),
                ...(def.fields ?? []),
            ]);
            for (const iface of def.interfaces ?? []) addMember(iface.name.value, def.name.value);
            break;
        case Kind.UNION_TYPE_DEFINITION:
            for (const type of def.types ?? []) addMember(def.name.value, type.name.value);
            break;
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_EXTENSION:
            inputs.set(def.name.value, [
                ...(inputs.get(def.name.value) ?? []),
                ...(def.fields ?? []),
            ]);
            break;
        default:
    }
}

function namedType(type: TypeNode): string {
    return type.kind === Kind.NAMED_TYPE ? type.name.value : namedType(type.type);
}

function expand(type: string): string[] {
    return [type, ...(members.get(type) ?? []).flatMap(expand)];
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

const key = (parent: string, field: FieldDefinitionNode): string =>
    ROOTS.includes(parent) ? field.name.value : `${parent}.${field.name.value}`;

// Types reachable from the roots without crossing a registered (guarded or exempt) field.
function unguardedReach(): Set<string> {
    const reached = new Set(ROOTS);
    const queue = [...ROOTS];
    while (queue.length) {
        const parent = queue.shift() as string;
        for (const field of fields.get(parent) ?? []) {
            if (key(parent, field) in CORE_ORDER_OPERATIONS) continue;
            for (const type of expand(namedType(field.type))) {
                if (fields.has(type) && !reached.has(type)) {
                    reached.add(type);
                    queue.push(type);
                }
            }
        }
    }
    return reached;
}

describe('core Admin API order operations', () => {
    it('no order data is reachable without passing a registered operation', () => {
        const uncovered: string[] = [];
        for (const parent of unguardedReach()) {
            for (const field of fields.get(parent) ?? []) {
                const returnsOrder = expand(namedType(field.type)).some(t => ORDER_TYPES.has(t));
                const takesId = ROOTS.includes(parent) && takesOrderId(field.arguments ?? []);
                if ((returnsOrder || takesId) && !(key(parent, field) in CORE_ORDER_OPERATIONS)) {
                    uncovered.push(key(parent, field));
                }
            }
        }
        expect(uncovered.sort()).toEqual([]);
    });

    it('the registry lists no field core no longer has', () => {
        const known = new Set(
            [...fields].flatMap(([parent, list]) => list.map(f => key(parent, f))),
        );
        expect(Object.keys(CORE_ORDER_OPERATIONS).filter(name => !known.has(name))).toEqual([]);
    });
});
