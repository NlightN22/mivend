declare module '@vendure/core' {
    interface CustomOrderFields {
        reservationDays?: number | null;
        reservationState?: OrderReservationState;
        // Why the last automatic reserve failed; cleared by any successful reserve (#199).
        reservationFailureReason?: ReservationFailureReason | null;
        reservationFailureDetail?: string | null;
        reservationFailedAt?: Date | null;
        // Order cancel request to the ERP (#194): REQUESTED | REFUSED | CANCELLED, null when none.
        cancelRequestedAt?: Date | null;
        cancelReason?: string | null;
        cancelRequestStatus?: string | null;
        cancelRefusalReason?: string | null;
        // Owned by @mivend/plugin-erp-order (declaration merging) — reserveOrder() reads this to
        // denormalize onto Reservation.branchId without taking a package dependency on
        // erp-order, see docs/access-control.md's branch-scope axis.
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
    // Owned by @mivend/plugin-moq (declaration merging) — reserveOrder()'s defense-in-depth
    // multiplicity guard reads this without taking a package dependency on plugin-moq, see
    // docs/order-flow.md "Pack-size / MOQ".
    interface CustomProductVariantFields {
        multiplicity?: number | null;
        // Owned by @mivend/plugin-acquiring's declaration; reserveOrder() gates on it being set.
        organizationId?: number | null;
    }
    // Owned by @mivend/plugin-erp-integration (declaration merging) — ReservationAvailabilityService
    // reads this to resolve a branch's Warehouses to their StockLocations without taking a
    // package dependency on erp-integration, see BranchStockLocationStrategy for the sibling
    // resolution this mirrors.
    interface CustomStockLocationFields {
        warehouseErpId?: string | null;
    }
    // Owned by @mivend/plugin-erp-integration (declaration merging) — ReservationAvailabilityService
    // reads this to cap its ATP formula at the ERP's own availableQuantity, see issue #72 and
    // StockStreamHandler, without taking a package dependency on erp-integration.
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

// Which path triggered reserveOrder() — see docs/order-flow.md "Single reservation service,
// two triggers". Only 'manual' has a real caller today; 'auto-prepaid'/'auto-trust-rule' are
// kept open for stages 4 and the deferred trusted-customer rule so the signature doesn't need
// to change later.
export type ReservationCreationMethod = 'manual' | 'auto-prepaid' | 'auto-trust-rule';

// Order.customFields.reservationState — an internal technical enum fixed by app logic, not
// ERP business data (see the backend-plugin-rules skill's "Business data must live in
// the database"). See
// docs/order-flow.md "Reservation state (separate from Order.state)".
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
