import { Permission, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

// sourceType -> the Permission that gates visibility of an 'administrator-broadcast' notification
// with that sourceType. Mirrors the read permission the underlying resource's OWN resolver already
// requires — an administrator without that permission must not see the broadcast either (issue #87
// audit, mivend.audit.85):
// - 'reservation-reconciliation' / 'reservation-intervention': ReservationResolver.
//   openReservationReconciliationIssues requires Permission.ReadOrder.
// - 'payment-reconciliation': PaymentReconciliationIssueResolver.openPaymentReconciliationIssues
//   requires CustomPermission.ReadPayment.
// 'erp-reconciliation' is deliberately absent: those notifications are never broadcast (they carry
// a real recipientId via triggeredByAdministratorId — see ReconciliationResolver's own
// CustomPermission.ManageErpIntegration gate for reference), so this map doesn't need to cover them.
// A sourceType not listed here is visible to every authenticated administrator, unchanged from
// before this fix — only the three types above are gated.
export const NOTIFICATION_SOURCE_PERMISSIONS: Record<string, Permission> = {
    'reservation-reconciliation': Permission.ReadOrder,
    'reservation-intervention': Permission.ReadOrder,
    'payment-reconciliation': CustomPermission.ReadPayment.Permission,
};

export interface BroadcastVisibility {
    // Every sourceType this map gates.
    gatedSourceTypes: string[];
    // The subset of gatedSourceTypes this administrator may actually see.
    allowedGatedSourceTypes: string[];
    // The subset of gatedSourceTypes this administrator may NOT see — a small, bounded denylist
    // (unlike an allowlist of every visible sourceType, which would have to also enumerate every
    // current and future ungated sourceType to be usable as an inclusion check). Used by the WS
    // subscription identity (apps/server/src/subscriptions.ts), where the check is
    // "!deniedSourceTypes.includes(sourceType)" rather than an allowlist membership check.
    deniedSourceTypes: string[];
}

// Single source of truth for "which broadcast sourceTypes can this administrator see" — used by
// both NotificationService.findForRecipient (query path, real RequestContext) and
// apps/server/src/subscriptions.ts (WS path, RequestContext built from the cached session) so the
// exact same rule gates both surfaces.
export function resolveBroadcastVisibility(ctx: RequestContext): BroadcastVisibility {
    const gatedSourceTypes = Object.keys(NOTIFICATION_SOURCE_PERMISSIONS);
    const allowedGatedSourceTypes = gatedSourceTypes.filter(sourceType =>
        ctx.userHasPermissions([NOTIFICATION_SOURCE_PERMISSIONS[sourceType]]),
    );
    const deniedSourceTypes = gatedSourceTypes.filter(
        sourceType => !allowedGatedSourceTypes.includes(sourceType),
    );
    return { gatedSourceTypes, allowedGatedSourceTypes, deniedSourceTypes };
}
