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

// Correlation keys are stable, cross-instance identifiers — never the sending instance's native
// auto-increment ids, which are per-instance and meaningless on the other side (same class of
// gotcha as Administrator.id, see AGENTS.md). Customer is correlated by emailAddress and
// ProductVariant by sku — both already globally unique, ERP-sourced identifiers used as the
// correlation key elsewhere in this codebase (CustomerHandler, PriceHandler) — no new field
// needed for either. The order itself has no such natural key, so `sourceOrderId` (the
// originating instance's native Order id) is carried explicitly and stored on the receiving
// side's local Order.customFields.sourceOrderId for idempotent upsert.
const OrderCreatedPayload = z.object({
    sourceOrderId: z.string(),
    orderCode: z.string(),
    customerEmail: z.string().email(),
    branchId: z.string(),
    // The order's own state at the moment it became sync-worthy (e.g. 'ArrangingPayment' or
    // 'PaymentAuthorized', never 'AddingItems' since that's what triggers this event in the
    // first place) — lets the receiving instance's replica start in the right state instead of
    // being stuck in 'AddingItems' forever. Optional only for backward compatibility with
    // already-queued outbox entries from before this field existed.
    state: z.string().optional(),
    lines: z.array(
        z.object({
            sku: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().int().nonnegative(),
        }),
    ),
});

const OrderUpdatedPayload = z.object({
    sourceOrderId: z.string(),
    state: z.string(),
});

// A payment fact — see docs/architecture.md's "Order as a read-model: independent event
// streams per concern (CQRS)". Published by whichever instance actually witnessed the payment
// (a real Vendure `PaymentStateTransitionEvent` on that instance's own order, or an operator
// explicitly reporting one for an order they don't own via `recordWitnessedPayment`). The
// order's real owner applies it for real (a real `addPaymentToOrder`); every other instance
// holding only a replica applies it as an informational `customFields.paymentStatus` projection
// — never a direct mutation of an order it doesn't own (see AGENTS.md sync rule #10).
const PaymentRecordedPayload = z.object({
    sourceOrderId: z.string(),
    method: z.string(),
    amount: z.number().int().nonnegative(),
    state: z.enum(['Authorized', 'Settled']),
    witnessedBy: z.string(),
    // Optional: present when the witnessed payment applies to a specific plugin-acquiring
    // Invoice (rather than only the legacy native-Order payment above) — lets
    // CentralConsumer additionally publish BranchKassaPaymentEvent for the acquiring inbox.
    invoiceId: z.number().int().positive().optional(),
    outcome: z.enum(['success', 'pending', 'fail', 'cancel']).optional(),
    // RRN (Retrieval Reference Number) from the branch's card terminal, or the kassa's own
    // fiscal receipt/cheque number for a cash payment — mandatory whenever invoiceId/outcome are
    // present (i.e. this payload represents a plugin-acquiring payment fact), since without it
    // the payment can never be reconciled against the branch's kassa system. Left optional at
    // this wire-format/parse layer (this envelope is shared with non-payment sync payloads too)
    // — enforced instead at the point that actually matters, PaymentEventListener, which rejects
    // (dead-letters) a payment fact missing it rather than silently enqueuing it as valid.
    rrn: z.string().optional(),
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
    orderCode: z.string(),
});

const ReservationReleasedPayload = z.object({
    reservationId: z.string(),
    orderCode: z.string(),
});

// Central is the master for Administrator identity — branches hold a read-only replica
// (including the password hash, so branch login works fully offline). See
// docs/architecture.md's "User identity: Central is master, not federated".
const AdministratorSyncPayload = z.object({
    administratorId: z.string(),
    emailAddress: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    roleCodes: z.array(z.string()),
    passwordHash: z.string(),
    branchId: z.string().nullable(),
});

const AdministratorDeactivatedPayload = z.object({
    administratorId: z.string(),
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
        eventType: z.literal('payment.recorded'),
        payload: PaymentRecordedPayload,
    }),
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
    Envelope.extend({
        eventType: z.literal('administrator.created'),
        payload: AdministratorSyncPayload,
    }),
    Envelope.extend({
        eventType: z.literal('administrator.updated'),
        payload: AdministratorSyncPayload,
    }),
    Envelope.extend({
        eventType: z.literal('administrator.deactivated'),
        payload: AdministratorDeactivatedPayload,
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
