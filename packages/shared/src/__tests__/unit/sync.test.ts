import { describe, it, expect } from 'vitest';
import { SyncEventSchema, assertNever } from '../../sync';
import type { SyncEvent, SyncEventByType } from '../../sync';

describe('SyncEventSchema', () => {
    it('parses a valid product.updated event', () => {
        const raw = {
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            eventType: 'product.updated',
            sourceInstanceId: 'hub',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: { productId: '1', name: 'Brake Pad' },
        };
        const result = SyncEventSchema.parse(raw);
        expect(result.eventType).toBe('product.updated');
    });

    it('parses a valid price.updated event', () => {
        const raw = {
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            eventType: 'price.updated',
            sourceInstanceId: 'hub',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: {
                variantId: '5',
                priceTypeCode: 'WHOLESALE',
                amount: 15000,
                currencyCode: 'RUB',
            },
        };
        const result = SyncEventSchema.parse(raw);
        expect(result.eventType).toBe('price.updated');
    });

    it('rejects unknown event type', () => {
        const raw = {
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            eventType: 'unknown.event',
            sourceInstanceId: 'hub',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: {},
        };
        expect(() => SyncEventSchema.parse(raw)).toThrow();
    });

    it('rejects malformed eventId (not UUID)', () => {
        const raw = {
            eventId: 'not-a-uuid',
            eventType: 'product.updated',
            sourceInstanceId: 'hub',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: { productId: '1' },
        };
        expect(() => SyncEventSchema.parse(raw)).toThrow();
    });

    it('rejects price with negative amount', () => {
        const raw = {
            eventId: '550e8400-e29b-41d4-a716-446655440003',
            eventType: 'price.updated',
            sourceInstanceId: 'hub',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: { variantId: '5', priceTypeCode: 'RETAIL', amount: -100, currencyCode: 'RUB' },
        };
        expect(() => SyncEventSchema.parse(raw)).toThrow();
    });
});

describe('SyncEventByType', () => {
    it('narrows payload type correctly', () => {
        const event: SyncEventByType<'order.created'> = {
            eventId: '550e8400-e29b-41d4-a716-446655440004',
            eventType: 'order.created',
            sourceInstanceId: 'branch-a',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: {
                orderId: 'o1',
                customerId: 'c1',
                branchId: 'branch-a',
                lines: [{ variantId: 'v1', quantity: 2, unitPrice: 5000 }],
            },
        };
        expect(event.payload.lines).toHaveLength(1);
    });
});

describe('assertNever', () => {
    it('throws on unexpected event — simulates missing case in switch', () => {
        expect(() => assertNever('unknown' as never)).toThrow();
    });
});

// ─── Exhaustive switch compile-time check ────────────────────────────────────
// This function will NOT compile if a new eventType is added to SyncEventSchema
// without adding a corresponding case here. That is the point.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _exhaustiveConsumerExample(event: SyncEvent): string {
    switch (event.eventType) {
        case 'product.created':
            return 'ok';
        case 'product.updated':
            return 'ok';
        case 'product.deleted':
            return 'ok';
        case 'price.updated':
            return 'ok';
        case 'customer.created':
            return 'ok';
        case 'customer.updated':
            return 'ok';
        case 'credit-terms.updated':
            return 'ok';
        case 'order.created':
            return 'ok';
        case 'order.updated':
            return 'ok';
        case 'inventory.updated':
            return 'ok';
        case 'reservation.created':
            return 'ok';
        case 'reservation.released':
            return 'ok';
        case 'administrator.created':
            return 'ok';
        case 'administrator.updated':
            return 'ok';
        case 'administrator.deactivated':
            return 'ok';
        default:
            return assertNever(event);
    }
}
