// MiVend-owned outbound event contract. Schema evolution rule (mirrors Integration Service's own
// §18 Protobuf rules, adapted for JSON Schema): additive-only — new fields must be optional, an
// existing field is never renamed or repurposed, a removed field's name is never reused for
// something else.
//
// customerId/warehouseId/lines are kept optional here (mivend#85) even though the listener only
// ever emits an event once all three are actually resolved for at least one line (see
// order-submitted.listener.ts) — an event that fails to resolve them is simply never published
// for that order/group, per the schema's own additive-only rule (a field a not-yet-updated
// consumer doesn't know about must stay optional, never silently required).
export const ORDER_SUBMITTED_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'OrderSubmitted',
    type: 'object',
    required: ['eventId', 'orderId', 'orderCode', 'organizationId', 'submittedAt'],
    properties: {
        eventId: { type: 'string', format: 'uuid' },
        orderId: { type: 'string' },
        orderCode: { type: 'string' },
        organizationId: { type: 'string' },
        submittedAt: { type: 'string', format: 'date-time' },
        totalWithTax: { type: 'integer' },
        currencyCode: { type: 'string' },
        // Counterparty.erpId for the order's customer — see CounterpartyService.getForCustomer.
        customerId: { type: 'string' },
        // The ERP warehouse (StockLocation.customFields.warehouseErpId) this payload's lines were
        // allocated against — one payload per distinct (organizationId, warehouseId) combination.
        warehouseId: { type: 'string' },
        lines: {
            type: 'array',
            items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'number' },
                    priceTypeId: { type: ['string', 'null'] },
                },
                additionalProperties: true,
            },
        },
    },
    additionalProperties: true,
} as const;

export interface OrderSubmittedLine {
    productId: string;
    quantity: number;
    priceTypeId: string | null;
}

export interface OrderSubmittedPayload {
    eventId: string;
    orderId: string;
    orderCode: string;
    organizationId: string;
    submittedAt: string;
    totalWithTax?: number;
    currencyCode?: string;
    customerId?: string;
    warehouseId?: string;
    lines?: OrderSubmittedLine[];
}
