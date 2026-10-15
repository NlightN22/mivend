import { Permission, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

// Mirrors each source resource's own read gate: an admin lacking it must not see the broadcast.
// erp-reconciliation is absent: it is never broadcast. Unlisted sourceTypes stay visible to all.
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
    // Denylist, not allowlist: an allowlist would need every current and future ungated type listed.
    deniedSourceTypes: string[];
}

// Shared by the query and WS subscription paths so both surfaces apply the same gate.
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
