import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import {
    SystemHealthCheckItem,
    SystemHealthQueryResult,
    getMissingChecks,
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
const systemHealthCheckDocument = graphql(`
    query SystemHealthCheckData {
        zones(options: { take: 1 }) {
            totalItems
        }
        taxCategories(options: { take: 1 }) {
            totalItems
        }
        taxRates(options: { take: 100 }) {
            items {
                enabled
            }
        }
        activeChannel {
            defaultTaxZone {
                id
            }
        }
        shippingMethods(options: { take: 1 }) {
            totalItems
        }
        paymentMethods(options: { take: 100 }) {
            items {
                enabled
            }
        }
    }
`);

// One combined alert rather than 6 near-identical DashboardAlertDefinitions — per AGENTS.md's
// no-unjustified-duplication rule, this is fundamentally one "system isn't fully configured yet"
// alert; `title`/`description` list whichever of the 6 items are currently missing.
export const systemHealthAlert: DashboardAlertDefinition<SystemHealthCheckItem[]> = {
    id: 'system-health-checklist',
    check: async () => {
        try {
            const data = (await api.query(systemHealthCheckDocument)) as SystemHealthQueryResult;
            return getMissingChecks(data);
        } catch {
            // A viewer lacking one of the underlying read permissions (or a transient network
            // error) must not crash the dashboard shell — fail closed to "nothing to report"
            // rather than surfacing a broken alert.
            return [];
        }
    },
    // `check()` is async and react-query reports `data: undefined` on every render before it
    // resolves — unlike search-index-buffer-alert.ts's numeric `data > 0` (safely `false` for
    // `undefined`), an array-typed alert must guard explicitly or `.length`/`.some`/`.map` throw
    // and crash the whole <Alerts> component tree (reproduced during manual verification).
    shouldShow: missing => (missing?.length ?? 0) > 0,
    severity: missing =>
        (missing ?? []).some(item => item.id === 'default-tax-zone') ? 'error' : 'warning',
    title: missing =>
        `System configuration incomplete (${(missing ?? []).length} item${(missing ?? []).length === 1 ? '' : 's'})`,
    description: missing => (missing ?? []).map(item => item.label).join(', '),
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [systemHealthAlert],
});
