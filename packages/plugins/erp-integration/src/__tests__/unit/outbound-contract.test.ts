import { describe, expect, it } from 'vitest';

import { resolveOutboundSchema } from '../../schemas/contract-schema';
import { ORDER_SUBMITTED_SCHEMA } from '../../schemas/order-submitted.schema';

interface JsonSchemaNode {
    type?: string | string[];
    required?: string[];
    properties?: Record<string, JsonSchemaNode>;
    items?: JsonSchemaNode;
}

const typeOf = (value: unknown): string =>
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

function violations(value: unknown, node: JsonSchemaNode, path: string): string[] {
    const allowed = ([] as string[]).concat(node.type ?? []);
    const actual = typeOf(value);
    const matches = allowed.some(t => t === actual || (t === 'integer' && Number.isInteger(value)));
    if (allowed.length > 0 && !(allowed.includes('number') && actual === 'number') && !matches) {
        return [`${path}: expected ${allowed.join('|')}, got ${actual}`];
    }
    if (Array.isArray(value) && node.items) {
        return value.flatMap((item, i) => violations(item, node.items!, `${path}[${i}]`));
    }
    if (actual !== 'object') return [];
    const record = value as Record<string, unknown>;
    const missing = (node.required ?? []).filter(key => record[key] === undefined);
    return [
        ...missing.map(key => `${path}.${key}: required but missing`),
        ...Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
            record[key] === undefined ? [] : violations(record[key], child, `${path}.${key}`),
        ),
    ];
}

// What OrderSubmittedBuilder emits for a fully resolved order (kept in step with its own test).
const BUILDER_PAYLOAD = {
    eventId: '5378af5e-48df-416f-9bb7-b06f29d245c3',
    orderId: '7',
    orderCode: 'ORD-001',
    orderUuid: '8f1b9f1a-6b2e-4d2a-9b8e-1e2f3a4b5c6d',
    orderNumber: 'ORD-001',
    organizationId: 'org-erp-1',
    contractId: 'contract-1',
    customerId: 'counterparty-1',
    warehouseId: 'wh-1',
    lines: [
        {
            productId: 'product-1',
            quantity: 2,
            priceTypeId: 'price-type-wholesale',
            lineUuid: '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d',
        },
    ],
    submittedAt: '2026-10-08T09:06:46.376Z',
    totalWithTax: 101000,
    currencyCode: 'RUB',
};

describe('order.submitted outbound contract', () => {
    const { schema, source } = resolveOutboundSchema('order.submitted', ORDER_SUBMITTED_SCHEMA);

    it('accepts the payload the builder produces', () => {
        expect(violations(BUILDER_PAYLOAD, schema as JsonSchemaNode, '$')).toEqual([]);
    });

    it('rejects a payload missing a field the consumer requires', () => {
        const withoutWarehouse: Record<string, unknown> = { ...BUILDER_PAYLOAD };
        delete withoutWarehouse.warehouseId;
        expect(violations(withoutWarehouse, schema as JsonSchemaNode, '$')).toContain(
            '$.warehouseId: required but missing',
        );
    });

    it('requires the contract the order is registered under (local copy, package from 0.54.0)', () => {
        const withoutContract: Record<string, unknown> = { ...BUILDER_PAYLOAD };
        delete withoutContract.contractId;
        expect(
            violations(withoutContract, ORDER_SUBMITTED_SCHEMA as unknown as JsonSchemaNode, '$'),
        ).toContain('$.contractId: required but missing');
    });

    it('takes the schema from the contract package when it carries one, else the local copy', () => {
        expect(['contract', 'local']).toContain(source);
        if (source === 'local') expect(schema).toBe(ORDER_SUBMITTED_SCHEMA);
    });
});
