import { formatMoney } from '../../i18n/format';
import { tr } from '../../utils/lazyLabels';
import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_STATE_LABEL,
    type BranchOption,
    type ManagerOption,
    type OrderListItem,
} from '../../api/orders';

export interface OrderFlag {
    label: string;
    variant: StatusBadgeVariant;
}

export type OrderListRow = {
    id: string;
    code: string;
    createdAt: string;
    customer: string;
    inn: string;
    priceTypeCode: string;
    manager: string;
    branch: string;
    state: string;
    stateVariant: StatusBadgeVariant;
    flags: OrderFlag[];
    total: string;
    currencyCode: string;
    placedBy: string;
    placedByMeta: string;
    reservation: string;
    reservationVariant: StatusBadgeVariant;
    attention: string;
};

export interface OrderRowContext {
    managers: ManagerOption[];
    branches: BranchOption[];
    isRejected: (erpStatus: string | null | undefined) => boolean;
    pendingApprovalOrderIds: Set<string>;
}

function lookup<T extends { id: string }>(
    list: T[],
    id: string | null | undefined,
    pick: (item: T) => string,
): string {
    if (!id) return '—';
    const found = list.find(item => item.id === id);
    return found ? pick(found) : '—';
}

// A null placedByAdministratorId means the customer placed the order on the storefront.
function placedByLabel(order: OrderListItem, managers: ManagerOption[]): string {
    const adminId = order.customFields?.placedByAdministratorId;
    if (adminId) return lookup(managers, adminId, m => m.name);
    return order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—';
}

function flagsFor(order: OrderListItem, ctx: OrderRowContext): OrderFlag[] {
    const flags: OrderFlag[] = [];
    if (order.creditLimitExceeded)
        flags.push({ label: tr('orders.flags.creditLimitExceeded'), variant: 'warning' });
    if (ctx.isRejected(order.customFields?.erpStatus))
        flags.push({ label: tr('orders.flags.rejectedByErp'), variant: 'danger' });
    if (order.customFields?.reservationFailureReason)
        flags.push({ label: tr('orders.flags.reserveFailed'), variant: 'warning' });
    if (order.customFields?.hasCheckFindings)
        flags.push({ label: tr('orders.flags.erpRequirements'), variant: 'warning' });
    return flags;
}

function attentionFor(order: OrderListItem, ctx: OrderRowContext): string {
    if (ctx.pendingApprovalOrderIds.has(order.id)) return tr('orders.attention.priceLimitExceeded');
    return order.state === 'PaymentSettled' ? tr('orders.attention.shipmentOverdue') : '';
}

export function toOrderRows(items: OrderListItem[], ctx: OrderRowContext): OrderListRow[] {
    return items.map(order => {
        const counterparty = order.counterparty;
        const reservationRaw = order.customFields?.reservationState ?? '';
        return {
            id: order.id,
            code: order.code,
            createdAt: order.createdAt,
            customer: counterparty?.shortName ?? '—',
            inn: counterparty?.inn ?? '',
            priceTypeCode: counterparty?.priceType ?? '',
            manager: lookup(ctx.managers, counterparty?.assignedManagerId, m => m.name),
            branch: lookup(ctx.branches, counterparty?.branchId, b => b.name),
            state: ORDER_STATE_LABEL[order.state] ?? order.state,
            stateVariant: ORDER_STATE_BADGE_VARIANT[order.state] ?? 'neutral',
            flags: flagsFor(order, ctx),
            total: formatMoney(order.totalWithTax, order.currencyCode),
            currencyCode: order.currencyCode,
            placedBy: placedByLabel(order, ctx.managers),
            placedByMeta: order.customFields?.placedByAdministratorId
                ? ''
                : tr('orders.list.placedByCustomer'),
            reservation: reservationRaw
                ? (ORDER_RESERVATION_STATE_OPTIONS.find(o => o.value === reservationRaw)?.label ??
                  reservationRaw)
                : tr('orders.reservation.none'),
            reservationVariant: ORDER_RESERVATION_STATE_BADGE_VARIANT[reservationRaw] ?? 'neutral',
            attention: attentionFor(order, ctx),
        };
    });
}
