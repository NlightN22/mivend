import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import {
    isZoneMissing,
    isTaxCategoryMissing,
    isTaxRateMissing,
    isDefaultTaxZoneMissing,
    isShippingMethodMissing,
    isPaymentMethodMissing,
} from './system-health-check.js';

// This file is the ../../system-health-dashboard.plugin.ts's `dashboard` entry point.
// @vendure/dashboard's static plugin-discovery step only registers a plugin's dashboard
// extension when it can find that plugin's *compiled* `@VendurePlugin({ dashboard: '...' })`
// decorator via an AST scan of either (a) node_modules (for a real npm-installed plugin) or
// (b) its own dashboard-config-loader's TS-introspection temp dir (for a plugin reached via a
// genuine relative import from vendure-config.ts). A pnpm-workspace-symlinked package (e.g. one
// under packages/plugins/*) fails both: its compiled JS lives outside the temp dir, and the
// scanner's own "is this a symlinked local package" check reclassifies it as (b) without ever
// actually feeding it through (b)'s compile step — so its dashboard extension is silently never
// discovered. Confirmed empirically while building this (a manual acorn AST-walk found the
// decorator's `dashboard` property fine directly against packages/plugins/system-health's
// compiled dist/, but the dashboard's own vite plugin logged "found 0 dashboard extensions"
// regardless of node_modules-root overrides) — hence this file sits under apps/server/src
// instead, a real relative import from vendure-config.ts.

// Issue #140: one standalone DashboardAlertDefinition per entity, each linking to the settings
// page that fixes it — see the dashboard-extension-rules skill's "one actionable alert per action" rule.

const zoneCountDocument = graphql(`
    query ZoneCountForSystemHealthAlert {
        zones(options: { take: 1 }) {
            totalItems
        }
    }
`);

export const zoneMissingAlert: DashboardAlertDefinition<boolean> = {
    id: 'system-health-zone-missing',
    check: async () => {
        try {
            return isZoneMissing((await api.query(zoneCountDocument)).zones);
        } catch {
            return false;
        }
    },
    shouldShow: missing => missing === true,
    severity: 'warning',
    title: 'No Tax Zone defined yet',
    description: 'At least one Zone is required before tax rates or shipping can be configured.',
    actions: [
        {
            label: 'Add a Zone',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/zones';
            },
        },
    ],
    recheckInterval: 60_000,
};

const taxCategoryCountDocument = graphql(`
    query TaxCategoryCountForSystemHealthAlert {
        taxCategories(options: { take: 1 }) {
            totalItems
        }
    }
`);

export const taxCategoryMissingAlert: DashboardAlertDefinition<boolean> = {
    id: 'system-health-tax-category-missing',
    check: async () => {
        try {
            return isTaxCategoryMissing((await api.query(taxCategoryCountDocument)).taxCategories);
        } catch {
            return false;
        }
    },
    shouldShow: missing => missing === true,
    severity: 'warning',
    title: 'No Tax Category defined yet',
    description: 'At least one Tax Category is required before products can be priced with tax.',
    actions: [
        {
            label: 'Add a Tax Category',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/tax-categories';
            },
        },
    ],
    recheckInterval: 60_000,
};

const taxRateExistsDocument = graphql(`
    query TaxRateExistsForSystemHealthAlert {
        taxRates(options: { take: 1 }) {
            items {
                id
            }
        }
    }
`);

export const taxRateMissingAlert: DashboardAlertDefinition<boolean> = {
    id: 'system-health-tax-rate-missing',
    check: async () => {
        try {
            return isTaxRateMissing((await api.query(taxRateExistsDocument)).taxRates);
        } catch {
            return false;
        }
    },
    shouldShow: missing => missing === true,
    severity: 'warning',
    title: 'No Tax Rate defined yet',
    description: 'At least one Tax Rate is required to charge tax on an order.',
    actions: [
        {
            label: 'Add a Tax Rate',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/tax-rates';
            },
        },
    ],
    recheckInterval: 60_000,
};

const defaultTaxZoneDocument = graphql(`
    query DefaultTaxZoneForSystemHealthAlert {
        activeChannel {
            id
            defaultTaxZone {
                id
            }
        }
    }
`);

export const defaultTaxZoneMissingAlert: DashboardAlertDefinition<{
    missing: boolean;
    channelId: string;
}> = {
    id: 'system-health-default-tax-zone-missing',
    check: async () => {
        try {
            const { activeChannel } = await api.query(defaultTaxZoneDocument);
            return {
                missing: isDefaultTaxZoneMissing(activeChannel),
                channelId: activeChannel.id,
            };
        } catch {
            return { missing: false, channelId: '' };
        }
    },
    shouldShow: result => result?.missing === true,
    severity: 'error',
    title: 'Active channel has no default tax zone',
    description:
        'Orders cannot be taxed correctly until the active channel has a default tax zone set.',
    actions: [
        {
            label: 'Set default tax zone',
            onClick: ({ data, dismiss }) => {
                dismiss();
                window.location.href = data?.channelId
                    ? `/channels/${data.channelId}`
                    : '/channels';
            },
        },
    ],
    recheckInterval: 60_000,
};

const shippingMethodCountDocument = graphql(`
    query ShippingMethodCountForSystemHealthAlert {
        shippingMethods(options: { take: 1 }) {
            totalItems
        }
    }
`);

export const shippingMethodMissingAlert: DashboardAlertDefinition<boolean> = {
    id: 'system-health-shipping-method-missing',
    check: async () => {
        try {
            return isShippingMethodMissing(
                (await api.query(shippingMethodCountDocument)).shippingMethods,
            );
        } catch {
            return false;
        }
    },
    shouldShow: missing => missing === true,
    severity: 'warning',
    title: 'No Shipping Method defined yet',
    description: 'At least one Shipping Method is required for an order to be placed.',
    actions: [
        {
            label: 'Add a Shipping Method',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/shipping-methods';
            },
        },
    ],
    recheckInterval: 60_000,
};

const paymentMethodEnabledDocument = graphql(`
    query PaymentMethodEnabledForSystemHealthAlert {
        paymentMethods(options: { take: 100 }) {
            items {
                enabled
            }
        }
    }
`);

export const paymentMethodMissingAlert: DashboardAlertDefinition<boolean> = {
    id: 'system-health-payment-method-missing',
    check: async () => {
        try {
            return isPaymentMethodMissing(
                (await api.query(paymentMethodEnabledDocument)).paymentMethods,
            );
        } catch {
            return false;
        }
    },
    shouldShow: missing => missing === true,
    severity: 'warning',
    title: 'No enabled Payment Method',
    description: 'At least one enabled Payment Method is required for checkout to work.',
    actions: [
        {
            label: 'Add a Payment Method',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/payment-methods';
            },
        },
    ],
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [
        zoneMissingAlert,
        taxCategoryMissingAlert,
        taxRateMissingAlert,
        defaultTaxZoneMissingAlert,
        shippingMethodMissingAlert,
        paymentMethodMissingAlert,
    ],
});
