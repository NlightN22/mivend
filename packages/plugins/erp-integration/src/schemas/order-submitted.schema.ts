// MiVend-owned outbound event contract. Schema evolution rule (mirrors Integration Service's own
// §18 Protobuf rules, adapted for JSON Schema): additive-only — new fields must be optional, an
// existing field is never renamed or repurposed, a removed field's name is never reused for
// something else.
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
    },
    additionalProperties: true,
} as const;

export interface OrderSubmittedPayload {
    eventId: string;
    orderId: string;
    orderCode: string;
    organizationId: string;
    submittedAt: string;
    totalWithTax?: number;
    currencyCode?: string;
}
