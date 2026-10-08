// MiVend-owned outbound event contract. Schema evolution rule (mirrors Integration Service's own
// §18 Protobuf rules, adapted for JSON Schema): additive-only — new fields must be optional, an
// existing field is never renamed or repurposed, a removed field's name is never reused for
// something else.
//
// Mirrors ORDER_SUBMITTED_JSON_SCHEMA in @nlightn22/event-contracts 0.54.0 (organizationId is the
// contract's organization, contractId is required); the package wins once it carries it (#203).
export const ORDER_SUBMITTED_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'OrderSubmitted',
    type: 'object',
    required: [
        'eventId',
        'orderId',
        'orderCode',
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
        // allocated against — one payload per distinct warehouse.
        warehouseId: { type: 'string' },
        lines: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'number', exclusiveMinimum: 0 },
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
    contractId: string;
    submittedAt: string;
    totalWithTax?: number;
    currencyCode?: string;
    customerId: string;
    warehouseId: string;
    lines: OrderSubmittedLine[];
}
