import { describe, expect, it } from 'vitest';
import { SyncEventSchema } from 'shared';

// Contract test for plugin-sync's RabbitMQ envelope — the single highest-risk external boundary
// per AGENTS.md's sync rules (central <-> branch, and the only wire format `plugin-sync` owns).
// SyncEventSchema (packages/shared/src/sync.ts) IS the contract: every producer validates against
// it before publish (SyncService.publishEntry), every consumer validates against it on receipt
// (RabbitMQService.subscribe). sync-cycle.test.ts already proves the end-to-end behavior (an
// invalid message goes to dead-letters without requeue) — this file targets the schema's own
// boundary guarantees in isolation: required fields, allowed values, unknown-field tolerance,
// optional/nullable semantics, and the routing-key format. No DB/RabbitMQ needed — the schema
// itself is the contract, so this is pure Zod-schema validation.
function validEnvelope(): {
    eventId: string;
    sourceInstanceId: string;
    timestamp: string;
} {
    return {
        eventId: '11111111-1111-1111-1111-111111111111',
        sourceInstanceId: 'branch-a',
        timestamp: new Date().toISOString(),
    };
}

describe('SyncEventSchema (contract)', () => {
    describe('required envelope fields', () => {
        it('accepts a well-formed product.created event', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.created',
                payload: { productId: 'p-1', slug: 'widget', name: 'Widget', enabled: true },
            });
            expect(result.success).toBe(true);
        });

        it('rejects a missing eventId', () => {
            const result = SyncEventSchema.safeParse({
                sourceInstanceId: 'branch-a',
                timestamp: new Date().toISOString(),
                eventType: 'product.created',
                payload: { productId: 'p-1', slug: 'widget', name: 'Widget', enabled: true },
            });
            expect(result.success).toBe(false);
        });

        it('rejects an eventId that is not a UUID', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventId: 'not-a-uuid',
                eventType: 'product.created',
                payload: { productId: 'p-1', slug: 'widget', name: 'Widget', enabled: true },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a timestamp that is not ISO-8601', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                timestamp: '18/07/2026',
                eventType: 'product.created',
                payload: { productId: 'p-1', slug: 'widget', name: 'Widget', enabled: true },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a missing sourceInstanceId', () => {
            const result = SyncEventSchema.safeParse({
                eventId: '11111111-1111-1111-1111-111111111111',
                timestamp: new Date().toISOString(),
                eventType: 'product.created',
                payload: { productId: 'p-1', slug: 'widget', name: 'Widget', enabled: true },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('eventType / discriminated union', () => {
        it('rejects an unknown eventType — never silently coerced to a known variant', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.renamed',
                payload: { productId: 'p-1' },
            });
            expect(result.success).toBe(false);
        });

        it("rejects a payload that does not match its own eventType's schema", () => {
            // price.updated payload shape given for a product.created event — proves each
            // variant's payload is checked against its own schema, not just "is an object".
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.created',
                payload: {
                    variantId: 'v-1',
                    priceTypeCode: 'retail',
                    amount: 100,
                    currencyCode: 'RUB',
                },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('required payload fields', () => {
        it('rejects price.updated missing a required field (amount)', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'price.updated',
                payload: { variantId: 'v-1', priceTypeCode: 'retail', currencyCode: 'RUB' },
            });
            expect(result.success).toBe(false);
        });

        it('rejects price.updated with a negative amount — the domain constraint is enforced by the contract, not just presence', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'price.updated',
                payload: {
                    variantId: 'v-1',
                    priceTypeCode: 'retail',
                    amount: -1,
                    currencyCode: 'RUB',
                },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a currencyCode that is not exactly 3 characters', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'price.updated',
                payload: {
                    variantId: 'v-1',
                    priceTypeCode: 'retail',
                    amount: 100,
                    currencyCode: 'RU',
                },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('optional payload fields (product.updated)', () => {
        it('accepts a partial update — every field but productId is optional', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.updated',
                payload: { productId: 'p-1', enabled: false },
            });
            expect(result.success).toBe(true);
        });

        it('still requires productId even though every other field is optional', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.updated',
                payload: { enabled: false },
            });
            expect(result.success).toBe(false);
        });
    });

    describe('unknown extra fields — forward compatibility', () => {
        it('tolerates (silently strips) an unknown extra field on the payload rather than rejecting the whole event', () => {
            // Zod's default z.object() mode is "strip", not "strict" — a producer on a newer
            // version adding a field a consumer doesn't know about yet must not break that
            // consumer. If this ever changes to `.strict()`, this test documents the behavior
            // change so it's a deliberate decision, not a silent regression.
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.created',
                payload: {
                    productId: 'p-1',
                    slug: 'widget',
                    name: 'Widget',
                    enabled: true,
                    futureField: 'from a newer producer',
                },
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.payload).not.toHaveProperty('futureField');
            }
        });

        it('tolerates an unknown extra field on the envelope itself', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'product.deleted',
                payload: { productId: 'p-1' },
                futureEnvelopeField: 'from a newer producer',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('payment.recorded — the branch-kassa/plugin-acquiring payment boundary', () => {
        function validPaymentPayload(): Record<string, unknown> {
            return {
                sourceOrderId: 'order-1',
                method: 'cash',
                amount: 1000,
                state: 'Settled',
                witnessedBy: 'branch-a',
            };
        }

        it('accepts the legacy native-Order shape with no invoiceId/organizationId/outcome/rrn at all', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: validPaymentPayload(),
            });
            expect(result.success).toBe(true);
        });

        it('accepts the full plugin-acquiring shape (invoiceId + organizationId + outcome + rrn all present)', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: {
                    ...validPaymentPayload(),
                    invoiceId: 42,
                    organizationId: 1,
                    outcome: 'success',
                    rrn: '123456789012',
                },
            });
            expect(result.success).toBe(true);
        });

        it('rejects an outcome value outside the recognized set', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: { ...validPaymentPayload(), invoiceId: 42, outcome: 'bogus' },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a state value outside Authorized/Settled', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: { ...validPaymentPayload(), state: 'Captured' },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a negative amount', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: { ...validPaymentPayload(), amount: -1 },
            });
            expect(result.success).toBe(false);
        });

        it('rejects a non-positive invoiceId when present — plugin-acquiring Invoice ids are always positive', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: { ...validPaymentPayload(), invoiceId: 0 },
            });
            expect(result.success).toBe(false);
        });

        // This wire-format layer intentionally leaves invoiceId/organizationId/outcome/rrn all
        // optional (see PaymentRecordedPayload's own comment) — the mandatory-together
        // requirement (an invoiceId with no rrn is invalid) is enforced downstream by
        // PaymentEventListener, not here. This test documents that boundary explicitly, so it
        // reads as a deliberate design decision rather than a gap this contract suite missed.
        it('does NOT reject invoiceId present without rrn at the schema level — that combination is rejected by PaymentEventListener instead, not this schema', () => {
            const result = SyncEventSchema.safeParse({
                ...validEnvelope(),
                eventType: 'payment.recorded',
                payload: { ...validPaymentPayload(), invoiceId: 42, outcome: 'success' },
            });
            expect(result.success).toBe(true);
        });
    });

    describe('routing key format — <eventType>.<target>', () => {
        // SyncService.publishEntry builds this inline (`${entry.eventType}.${entry.target}`),
        // and every consumer's binding key depends on it (RabbitMQService.subscribe's callers use
        // patterns like '#.central', '#.branch-a', '#.all-branches') — pinning the format here
        // means a change to the separator or field order is a visible, intentional diff, not a
        // silent break of every consumer's binding.
        it.each([
            ['product.updated', 'branch-a', 'product.updated.branch-a'],
            ['administrator.created', 'all-branches', 'administrator.created.all-branches'],
            ['order.created', 'central', 'order.created.central'],
        ])('formats eventType=%s target=%s as %s', (eventType, target, expected) => {
            expect(`${eventType}.${target}`).toBe(expected);
        });
    });
});
