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

export interface ErpExportDataMissingLine {
    orderLineId: string;
    productVariantId: string;
    missing: Array<'productId' | 'warehouseId'>;
}

// mivend#85: reserveOrder() is the actual commit point for "which warehouse does this order's
// stock come from" (see docs/order-flow.md's two-stage reservation model — Reservation, not
// Vendure's native Allocation, is this project's real per-line warehouse fact). If the data
// erp-integration's order.submitted event needs (a Counterparty for the customer, an ERP
// externalId for the product, an ERP-synced warehouse for the resolved StockLocation) isn't
// available yet, the order must not be reservable at all — surfacing this as a silently-skipped
// outbound event later is what mivend#85 explicitly decided against. Full-order-only, same as
// InsufficientStockError/InvalidMultiplicityError: nothing is written until every line resolves.
export class ErpExportDataMissingError extends Error {
    readonly code = 'ERP_EXPORT_DATA_MISSING';

    constructor(
        public readonly missingCustomerId: boolean,
        public readonly lines: ErpExportDataMissingLine[],
    ) {
        super('Order is missing ERP-export data required before it can be reserved');
    }
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
