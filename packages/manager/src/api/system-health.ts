import { adminApi } from './client';
import {
    SystemHealthCheckDataDocument,
    type SystemHealthCheckDataQuery,
} from './generated/graphql';

// Hardcoded on purpose: Zone, TaxCategory and TaxRate can exist while Channel.defaultTaxZone
// is still null, silently breaking tax calculation. Not a generic check registry by design.

export type SystemHealthQueryResult = SystemHealthCheckDataQuery;

// Verified against @vendure/core 3.7.3. ShippingMethod has no enabled; only existence is checked.
// Channel field is defaultTaxZone (object), not defaultTaxZoneId; PaymentMethod filtered client-side.
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
