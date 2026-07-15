export interface InsufficientStockLine {
    orderLineId: string;
    productVariantId: string;
    required: number;
    available: number;
}

// reserveOrder() is full-order-only (see docs/order-flow.md "Full-order-only reservation") —
// carries every short line at once so the caller can show exactly what's wrong per line,
// rather than failing on the first short line found.
export class InsufficientStockError extends Error {
    readonly code = 'INSUFFICIENT_STOCK';

    constructor(public readonly lines: InsufficientStockLine[]) {
        super('Insufficient stock to reserve this order');
    }
}

export class OrderNotEligibleError extends Error {
    readonly code = 'ORDER_NOT_ELIGIBLE';
}

export interface InvalidMultiplicityLine {
    orderLineId: string;
    productVariantId: string;
    quantity: number;
    multiplicity: number;
}

// Defense in depth alongside the moq plugin's OrderInterceptor (see docs/order-flow.md
// "Pack-size / MOQ") — guards a quantity reaching reserveOrder() through any path other than
// the two order-mutation hooks, or a multiplicity value that changed between add-line time and
// confirm time.
export class InvalidMultiplicityError extends Error {
    readonly code = 'INVALID_MULTIPLICITY';

    constructor(public readonly lines: InvalidMultiplicityLine[]) {
        super('Order line quantity is not a multiple of the required pack size');
    }
}
