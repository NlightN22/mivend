// Pure derivation logic, deliberately separated from the React/Dashboard alert plumbing in
// index.ts so it can be unit-tested the same way issue #76's manager-portal version is
// (packages/manager/src/api/system-health.ts / its __tests__/unit/system-health.test.ts).
// Same fixed 6-item checklist, same field notes — see that file for why ShippingMethod has no
// `enabled` filter and why `Channel.defaultTaxZoneId` is really `activeChannel.defaultTaxZone`.

export interface SystemHealthQueryResult {
    zones: { totalItems: number };
    taxCategories: { totalItems: number };
    taxRates: { items: { enabled: boolean }[] };
    activeChannel: { defaultTaxZone: { id: string } | null };
    shippingMethods: { totalItems: number };
    paymentMethods: { items: { enabled: boolean }[] };
}

export interface SystemHealthCheckItem {
    id: string;
    label: string;
    missing: boolean;
}

export function buildSystemHealthChecklist(data: SystemHealthQueryResult): SystemHealthCheckItem[] {
    return [
        { id: 'zone', label: 'At least one Zone', missing: data.zones.totalItems === 0 },
        {
            id: 'tax-category',
            label: 'At least one Tax Category',
            missing: data.taxCategories.totalItems === 0,
        },
        {
            id: 'tax-rate',
            label: 'At least one Tax Rate',
            missing: data.taxRates.items.length === 0,
        },
        {
            id: 'default-tax-zone',
            label: "Active channel's default tax zone",
            missing: !data.activeChannel.defaultTaxZone,
        },
        {
            id: 'shipping-method',
            label: 'At least one Shipping Method',
            missing: data.shippingMethods.totalItems === 0,
        },
        {
            id: 'payment-method',
            label: 'At least one enabled Payment Method',
            missing: !data.paymentMethods.items.some(m => m.enabled),
        },
    ];
}

export function getMissingChecks(data: SystemHealthQueryResult): SystemHealthCheckItem[] {
    return buildSystemHealthChecklist(data).filter(item => item.missing);
}
