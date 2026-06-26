import { z } from 'zod';

// ─── Envelope ────────────────────────────────────────────────────────────────

const Envelope = z.object({
    eventId: z.string().uuid(),
    sourceInstanceId: z.string(),
    timestamp: z.string().datetime(),
});

// ─── Payload schemas ─────────────────────────────────────────────────────────
// Adding a new event type: add schema here + case in consumer. Missing case = compile error.

const ProductCreatedPayload = z.object({
    productId: z.string(),
    slug: z.string(),
    name: z.string(),
    enabled: z.boolean(),
});

const ProductUpdatedPayload = z.object({
    productId: z.string(),
    slug: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
});

const ProductDeletedPayload = z.object({
    productId: z.string(),
});

const PriceUpdatedPayload = z.object({
    variantId: z.string(),
    priceTypeCode: z.string(),
    amount: z.number().int().nonnegative(),
    currencyCode: z.string().length(3),
});

const CustomerCreatedPayload = z.object({
    customerId: z.string(),
    emailAddress: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
});

const CustomerUpdatedPayload = z.object({
    customerId: z.string(),
    emailAddress: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
});

const CreditTermsUpdatedPayload = z.object({
    customerId: z.string(),
    creditLimit: z.number().int().nonnegative(),
    paymentDeferralDays: z.number().int().nonnegative(),
});

const OrderCreatedPayload = z.object({
    orderId: z.string(),
    customerId: z.string(),
    branchId: z.string(),
    lines: z.array(
        z.object({
            variantId: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().int().nonnegative(),
        }),
    ),
});

const OrderUpdatedPayload = z.object({
    orderId: z.string(),
    state: z.string(),
});

const InventoryUpdatedPayload = z.object({
    variantId: z.string(),
    branchId: z.string(),
    stockOnHand: z.number().int().nonnegative(),
    stockAllocated: z.number().int().nonnegative(),
});

const ReservationCreatedPayload = z.object({
    reservationId: z.string(),
    variantId: z.string(),
    branchId: z.string(),
    quantity: z.number().int().positive(),
    expiresAt: z.string().datetime(),
});

const ReservationReleasedPayload = z.object({
    reservationId: z.string(),
});

// ─── Discriminated union — THE CONTRACT ──────────────────────────────────────
// This is the single source of truth for all sync event types.
// Every consumer MUST handle every variant — enforced at compile time via exhaustive switch.

export const SyncEventSchema = z.discriminatedUnion('eventType', [
    Envelope.extend({ eventType: z.literal('product.created'), payload: ProductCreatedPayload }),
    Envelope.extend({ eventType: z.literal('product.updated'), payload: ProductUpdatedPayload }),
    Envelope.extend({ eventType: z.literal('product.deleted'), payload: ProductDeletedPayload }),
    Envelope.extend({ eventType: z.literal('price.updated'), payload: PriceUpdatedPayload }),
    Envelope.extend({ eventType: z.literal('customer.created'), payload: CustomerCreatedPayload }),
    Envelope.extend({ eventType: z.literal('customer.updated'), payload: CustomerUpdatedPayload }),
    Envelope.extend({
        eventType: z.literal('credit-terms.updated'),
        payload: CreditTermsUpdatedPayload,
    }),
    Envelope.extend({ eventType: z.literal('order.created'), payload: OrderCreatedPayload }),
    Envelope.extend({ eventType: z.literal('order.updated'), payload: OrderUpdatedPayload }),
    Envelope.extend({
        eventType: z.literal('inventory.updated'),
        payload: InventoryUpdatedPayload,
    }),
    Envelope.extend({
        eventType: z.literal('reservation.created'),
        payload: ReservationCreatedPayload,
    }),
    Envelope.extend({
        eventType: z.literal('reservation.released'),
        payload: ReservationReleasedPayload,
    }),
]);

// ─── Derived types ───────────────────────────────────────────────────────────

export type SyncEvent = z.infer<typeof SyncEventSchema>;
export type SyncEventType = SyncEvent['eventType'];

// Extracts the payload type for a specific event — use in consumer handlers:
// type ProductUpdatedEvent = SyncEventByType<'product.updated'>
export type SyncEventByType<T extends SyncEventType> = Extract<SyncEvent, { eventType: T }>;

// ─── Outbox ──────────────────────────────────────────────────────────────────

export const SyncOutboxEntrySchema = z.object({
    id: z.string(),
    eventId: z.string().uuid(),
    eventType: z.string(),
    payload: z.unknown(),
    target: z.string(),
    createdAt: z.date(),
    deliveredAt: z.date().nullable(),
    retryCount: z.number().int(),
    lastError: z.string().nullable(),
    lastErrorAt: z.date().nullable(),
});

export type SyncOutboxEntry = z.infer<typeof SyncOutboxEntrySchema>;

// ─── Exhaustive handler helper ────────────────────────────────────────────────
// Use in the default branch of every consumer switch to get a compile error
// when a new event type is added to SyncEventSchema but not handled:
//
//   default: assertNever(event);

export function assertNever(event: never): never {
    throw new Error(`Unhandled sync event type: ${JSON.stringify(event)}`);
}
