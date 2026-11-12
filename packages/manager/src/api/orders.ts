import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { lazyLabels, lazyOptions, tr } from '../utils/lazyLabels';
import { adminApi } from './client';
import {
    BranchesDocument,
    TeamMembersDocument,
    type OrderListItemFieldsFragment,
} from './generated/graphql';

export type OrderListItem = OrderListItemFieldsFragment;

// Order.customFields.reservationState — an internal technical enum fixed by app logic (see
// plugin-reservation/src/types.ts), not ERP business data, same carve-out as ORDER_STATE_OPTIONS.
export const ORDER_RESERVATION_STATE_OPTIONS = lazyOptions('orders.reservation', [
    '',
    'NOT_REQUIRED',
    'AWAITING_CONFIRMATION',
    'RESERVED',
    'EXPIRED',
    'RELEASED',
    'FAILED',
] as const);

// Single source of truth for the Reservation badge color — same reasoning/precedent as
// ORDER_STATE_BADGE_VARIANT/FULFILLMENT_STATE_BADGE_VARIANT above.
export const ORDER_RESERVATION_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    AWAITING_CONFIRMATION: 'warning',
    RESERVED: 'success',
    EXPIRED: 'danger',
    RELEASED: 'neutral',
    FAILED: 'danger',
};

// Order.customFields.reservationFailureReason (plugin-reservation/src/types.ts) — why the last
// automatic reserve failed; set means "needs staff attention", cleared by a successful reserve (#199).
export const RESERVATION_FAILURE_LABEL = lazyLabels('orders.reservationFailure', [
    'INSUFFICIENT_STOCK',
    'ERP_EXPORT_DATA_MISSING',
    'NOT_ELIGIBLE',
    'UNEXPECTED',
]);

const ORDER_STATES = [
    'AddingItems',
    'Draft',
    'ArrangingPayment',
    'PaymentAuthorized',
    'PaymentSettled',
    'PartiallyShipped',
    'Shipped',
    'PartiallyDelivered',
    'Delivered',
    'Cancelled',
] as const;

// Vendure's own OrderProcess states, not ERP business data; a const list is intentional here.
// Documented carve-out for internal technical states in backend-plugin-rules.
// 'Draft' (capitalized) is the admin draft-order state, distinct from a customer's AddingItems cart.
export const ORDER_STATE_OPTIONS = lazyOptions('orders.state', ['', ...ORDER_STATES] as const);

// Must use real Vendure OrderSortParameter keys: DataTable column fields don't map 1:1
// (e.g. 'total' -> totalWithTax), so callers map through this before building sort.
export type OrderSortField = 'code' | 'state' | 'totalWithTax' | 'orderPlacedAt' | 'createdAt';

// Shared by every order list and the customer KPI strip — the same Order.state values must
// read the same everywhere in the manager portal.
export const ORDER_STATE_LABEL = lazyLabels('orders.state', ORDER_STATES);

// Keyed by raw Order.state, not the label, so relabeling ORDER_STATE_LABEL can't break colors.
// All Commercial-state badges must use this map, not a local variant.
export const ORDER_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    AddingItems: 'neutral',
    Draft: 'neutral',
    ArrangingPayment: 'warning',
    PaymentAuthorized: 'info',
    PaymentSettled: 'info',
    PartiallyShipped: 'warning',
    Shipped: 'info',
    PartiallyDelivered: 'warning',
    Delivered: 'success',
    Cancelled: 'danger',
};

// Keyed by Fulfillment.state plus the synthetic 'Not started', which has no Fulfillment record.
export const FULFILLMENT_STATE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    'Not started': 'neutral',
    Pending: 'warning',
    Shipped: 'info',
    Delivered: 'success',
    Cancelled: 'danger',
};

// Must stay in sync with the badge map keys above; 'Not started' is synthetic, not a Vendure state.
export const FULFILLMENT_STATE_OPTIONS = [
    {
        value: 'Not started',
        get label(): string {
            return tr('orders.fulfillment.notStarted');
        },
    },
    ...lazyOptions('orders.fulfillment', ['Pending', 'Shipped', 'Delivered', 'Cancelled'] as const),
];

// Not a quantity ratio: one fulfillment covering all lines reads 100% whatever its state.
// 'Cancelled' is off the sequence; callers must branch on it before looking up here.
export const FULFILLMENT_STAGE_INDEX: Record<string, number> = {
    'Not started': 0,
    Pending: 1,
    Shipped: 2,
    Delivered: 3,
};
export const FULFILLMENT_STAGE_COUNT = 3;

export interface ManagerOption {
    id: string;
    name: string;
    email: string;
    roleCodes: string[];
}

export async function fetchManagerOptions(): Promise<ManagerOption[]> {
    const result = await adminApi(TeamMembersDocument);
    return result.teamMembers.map(a => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.emailAddress,
        roleCodes: a.roleCodes,
    }));
}

export interface BranchOption {
    // Branch.id (DB primary key), never erpId: branchId fields and comparisons all use this value.
    // Branch is mivend-internal with no ERP counterpart; ERP's Department is a different entity.
    id: string;
    // Only set by BranchService.upsert from an ERP point code; createManual Branches have none.
    // Display-only; never compare against a branchId field.
    erpId: string;
    name: string;
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
    const result = await adminApi(BranchesDocument);
    return result.branches;
}
