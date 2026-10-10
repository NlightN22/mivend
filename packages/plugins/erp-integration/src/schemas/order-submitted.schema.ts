// MiVend-owned outbound event contract. Schema evolution rule (mirrors Integration Service's own
// §18 Protobuf rules, adapted for JSON Schema): additive-only — new fields must be optional, an
// existing field is never renamed or repurposed, a removed field's name is never reused for
// something else.
//
// Mirrors ORDER_SUBMITTED_JSON_SCHEMA in @nlightn22/event-contracts 0.54.0 (organizationId is the
// contract's organization, contractId is required); the package wins once it carries it (#203).
// mivend's own mirror is ahead of the currently-published npm version for orderUuid/orderNumber/
// lineUuid (issue #207): prepared, unpublished on a /opt/search-platform-wt-order-uuid branch
// (feat/order-submitted-uuid, 0.55.0), pending that side's review/release.
export const ORDER_SUBMITTED_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'OrderSubmitted',
    type: 'object',
    required: [
        'eventId',
        'orderId',
        'orderCode',
        'orderUuid',
        'orderNumber',
        'organizationId',
        'contractId',
        'customerId',
        'warehouseId',
        'lines',
        'submittedAt',
    ],
    properties: {
        eventId: { type: 'string', format: 'uuid' },
        orderId: { type: 'string' },
        orderCode: { type: 'string' },
        // The order's own immutable uuid (docs/identifiers.md) — the ERP deduplicates
        // registration by it.
        orderUuid: { type: 'string', format: 'uuid' },
        // The order's human-facing number (today still Order.code's old format — see
        // docs/identifiers.md's deferred DateStampedOrderCodeStrategy replacement).
        orderNumber: { type: 'string' },
        // Organization (ERP GUID) of the order's contract, the document header organization.
        organizationId: { type: 'string' },
        // Contract.erpId the order is registered under.
        contractId: { type: 'string' },
        submittedAt: { type: 'string', format: 'date-time' },
        totalWithTax: { type: 'integer' },
        currencyCode: { type: 'string' },
        departmentId: { type: ['string', 'null'] },
        // Counterparty.erpId for the order's customer — see CounterpartyService.getForCustomer.
        customerId: { type: 'string' },
        // The ERP warehouse (StockLocation.customFields.warehouseErpId) this payload's lines were
        // allocated against — one payload per order, one warehouse.
        warehouseId: { type: 'string' },
        lines: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                required: ['productId', 'quantity', 'lineUuid'],
                properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'number', exclusiveMinimum: 0 },
                    // Unit (ERP id) the quantity is expressed in; absent = the product's base unit.
                    unitId: { type: 'string' },
                    priceTypeId: { type: ['string', 'null'] },
                    // The OrderLine's own immutable uuid, for per-line ERP deduplication.
                    lineUuid: { type: 'string', format: 'uuid' },
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
    unitId?: string;
    priceTypeId: string | null;
    lineUuid: string;
}

export interface OrderSubmittedPayload {
    eventId: string;
    orderId: string;
    orderCode: string;
    orderUuid: string;
    orderNumber: string;
    organizationId: string;
    contractId: string;
    submittedAt: string;
    totalWithTax?: number;
    currencyCode?: string;
    customerId: string;
    warehouseId: string;
    lines: OrderSubmittedLine[];
    type: 'confirmed';
    reserveUntil: string;
}
