declare module '@vendure/core' {
    interface CustomOrderFields {
        reservationDays?: number | null;
        reservationState?: OrderReservationState;
        // Why the last automatic reserve failed; cleared by any successful reserve (#199).
        reservationFailureReason?: ReservationFailureReason | null;
        reservationFailureDetail?: string | null;
        reservationFailedAt?: Date | null;
        hasCheckFindings?: boolean;
        // Order cancel request to the ERP (#194): REQUESTED | REFUSED | CANCELLED, null when none.
        cancelRequestedAt?: Date | null;
        cancelReason?: string | null;
        cancelRequestStatus?: string | null;
        cancelRefusalReason?: string | null;
        // Declared via declaration merging by @mivend/plugin-erp-order; reserveOrder() reads it
        // to denormalize onto Reservation.branchId without a package dependency on erp-order.
        branchId?: string | null;
    }
    interface CustomGlobalSettingsFields {
        stockTierLowMax?: number | null;
        stockTierMediumMax?: number | null;
        autoReserveOnPlacement?: boolean | null;
    }
    // Owned by @mivend/plugin-acquiring's declaration; stamped at checkout, read by reserveOrder().
    interface CustomOrderLineFields {
        organizationId?: number | null;
    }
    // Declared via declaration merging by @mivend/plugin-moq; reserveOrder()'s multiplicity guard
    // reads it to avoid a package dependency on plugin-moq.
    interface CustomProductVariantFields {
        multiplicity?: number | null;
        // Owned by @mivend/plugin-acquiring's declaration; reserveOrder() gates on it being set.
        organizationId?: number | null;
    }
    // Declared via declaration merging by @mivend/plugin-erp-integration; resolves branch
    // Warehouses to StockLocations without a package dependency on erp-integration.
    interface CustomStockLocationFields {
        warehouseErpId?: string | null;
    }
    // Declared via declaration merging by @mivend/plugin-erp-integration; caps the ATP formula
    // at the ERP's availableQuantity without a package dependency on erp-integration.
    interface CustomStockLevelFields {
        erpAvailableQuantity?: number | null;
    }
}

export const loggerCtx = 'ReservationPlugin';

export const RESERVATION_PLUGIN_OPTIONS = Symbol('RESERVATION_PLUGIN_OPTIONS');

// Option defaults; read them through ReservationSettings, never these constants (docs/order-flow.md "TTL").
export const DEFAULT_RESERVATION_DAYS = 3;
export const DEFAULT_REJECTED_ORDER_RELEASE_DAYS = 3;
export const DEFAULT_PREPAID_RESERVATION_TTL_DAYS = 30;
export const EXPIRY_POLL_INTERVAL_DEFAULT = 60_000;

export interface ReservationPluginOptions {
    // Staff-facing default shown when confirming an order — see Order.customFields.reservationDays.
    defaultReservationDays?: number;
    // How long an ERP-rejected order keeps its reserve before it is released (docs/order-contracts.md).
    rejectedOrderReleaseDays?: number;
    expiryPollIntervalMs?: number;
}

// Only 'manual' has a real caller today; 'auto-prepaid' and 'auto-trust-rule' are reserved
// so the reserveOrder() signature does not have to change when those triggers are added.
export type ReservationCreationMethod = 'manual' | 'auto-prepaid' | 'auto-trust-rule';

// Internal technical enum set by app logic, not ERP business data; kept separate from
// Order.state.
export type OrderReservationState =
    | 'NOT_REQUIRED'
    | 'AWAITING_CONFIRMATION'
    | 'RESERVED'
    | 'EXPIRED'
    | 'RELEASED'
    | 'FAILED';

export const DEFAULT_ORDER_RESERVATION_STATE: OrderReservationState = 'NOT_REQUIRED';

// Order.customFields.reservationFailureReason — technical enum fixed by app logic, same exception
// as OrderReservationState: it maps 1:1 onto the error classes reserveOrder() throws.
export type ReservationFailureReason =
    | 'INSUFFICIENT_STOCK'
    | 'ERP_EXPORT_DATA_MISSING'
    | 'NOT_ELIGIBLE'
    | 'UNEXPECTED';
