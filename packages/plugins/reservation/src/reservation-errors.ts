export interface InsufficientStockLine {
    orderLineId: string;
    productVariantId: string;
    required: number;
    available: number;
}

// Full-order-only: collects every short line at once so the caller can report all of them,
// not just the first one found.
export class InsufficientStockError extends Error {
    readonly code = 'INSUFFICIENT_STOCK';

    constructor(public readonly lines: InsufficientStockLine[]) {
        super('Insufficient stock to reserve this order');
    }
}

export class OrderNotEligibleError extends Error {
    readonly code = 'ORDER_NOT_ELIGIBLE';
}

// Issue #211: thrown when no correlation key resolves to any local Order — lets the inbox
// resolve it as a no-op after the retry budget, instead of dead-lettering forever.
export class UnknownOrderUuidError extends Error {
    readonly code = 'UNKNOWN_ORDER_UUID';
}

export interface ErpExportDataMissingLine {
    orderLineId: string;
    productVariantId: string;
    missing: Array<'productId' | 'warehouseId' | 'organizationId'>;
}

// Fail the whole reservation if erp-integration's order.confirmed inputs are not yet synced;
// a silently skipped outbound event is what this prevents. Nothing is written until every line resolves.
export class ErpExportDataMissingError extends Error {
    readonly code = 'ERP_EXPORT_DATA_MISSING';

    constructor(
        public readonly missingCustomerId: boolean,
        public readonly lines: ErpExportDataMissingLine[],
        public readonly missingContract = false,
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

// Defense in depth behind the moq OrderInterceptor: catches quantities reaching reserveOrder()
// via paths other than the two order-mutation hooks, or a multiplicity changed since add-line.
export class InvalidMultiplicityError extends Error {
    readonly code = 'INVALID_MULTIPLICITY';

    constructor(public readonly lines: InvalidMultiplicityLine[]) {
        super('Order line quantity is not a multiple of the required pack size');
    }
}
