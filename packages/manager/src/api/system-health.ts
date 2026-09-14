import { adminApi } from './client';
import {
    SystemHealthCheckDataDocument,
    type SystemHealthCheckDataQuery,
} from './generated/graphql';

// Fixed, hardcoded 6-item checklist for the incident this page exists for (issue #76): Zone,
// TaxCategory and TaxRate can all exist while Channel.defaultTaxZone is still null, silently
// breaking tax calculation. Deliberately not a generic check-registry — see AGENTS.md's
// no-speculative-abstraction rule.

export type SystemHealthQueryResult = SystemHealthCheckDataQuery;

// Vendure 3.7.3's native admin schema, verified against @vendure/core's own schema files (no
// plugin/backend work needed here) — see packages/manager's SystemHealthPage.vue for the field
// notes:
// - ShippingMethod has no `enabled` field in this Vendure version (removal covered by
//   SoftDeletable/deletedAt instead) — item 5 is "at least one ShippingMethod exists at all".
// - PaymentMethod does have `enabled`, checked client-side over a bounded page of items rather
//   than guessing an unverified filter-parameter shape.
// - Channel.defaultTaxZoneId as literally named in the issue doesn't exist; the real field is
//   `defaultTaxZone: Zone` (nullable object) on `activeChannel`.
export async function fetchSystemHealthData(): Promise<SystemHealthQueryResult> {
    return adminApi(SystemHealthCheckDataDocument);
}

export interface SystemHealthCheckItem {
    id: string;
    label: string;
    status: 'ok' | 'missing';
    detail?: string;
}

export function buildSystemHealthChecklist(data: SystemHealthQueryResult): SystemHealthCheckItem[] {
    return [
        {
            id: 'zone',
            label: 'At least one Zone exists',
            status: data.zones.totalItems > 0 ? 'ok' : 'missing',
        },
        {
            id: 'tax-category',
            label: 'At least one Tax Category exists',
            status: data.taxCategories.totalItems > 0 ? 'ok' : 'missing',
        },
        {
            id: 'tax-rate',
            label: 'At least one Tax Rate exists',
            status: data.taxRates.items.length > 0 ? 'ok' : 'missing',
        },
        {
            id: 'default-tax-zone',
            label: 'Default tax zone is set on the active channel',
            status: data.activeChannel.defaultTaxZone ? 'ok' : 'missing',
            detail: data.activeChannel.defaultTaxZone
                ? undefined
                : 'Zone, Tax Category and Tax Rate can all exist while this is still unset — set it under Settings → Channels.',
        },
        {
            id: 'shipping-method',
            label: 'At least one Shipping Method exists',
            status: data.shippingMethods.totalItems > 0 ? 'ok' : 'missing',
        },
        {
            id: 'payment-method',
            label: 'At least one enabled Payment Method exists',
            status: data.paymentMethods.items.some(m => m.enabled) ? 'ok' : 'missing',
        },
    ];
}
