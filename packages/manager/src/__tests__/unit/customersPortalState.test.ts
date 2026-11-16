// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLocale } from '../../i18n';
import {
    buildCustomersColumns,
    CUSTOMERS_DEFAULT_HIDDEN,
} from '../../components/customers/customersColumns';
import { portalStateBadge } from '../../components/customers/customersRows';
import {
    BLANK_CUSTOMERS_FILTERS,
    CUSTOMERS_SORT_FIELDS,
    CUSTOMERS_VIEWS,
    isCustomersView,
    restoreCustomersFilters,
    viewFilter,
    fetchCustomersViewCounts,
} from '../../api/customersList';
import { fromCustomersUrlState, CUSTOMERS_URL_DEFAULTS } from '../../composables/customersListUrl';
import { operationUi } from '../../components/bulk-operations/operationUi';
import { OPERATION_PERMISSIONS } from '../../components/bulk-operations/operationPermissions';
import { reasonLabel } from '../../api/bulkOperationsReport';

const adminApi = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ adminApi }));

describe('customers portal state column', () => {
    afterEach(() => setLocale('en'));

    it.each(['en', 'ru'] as const)(
        'replaces readiness with a visible portalState (%s)',
        async locale => {
            await setLocale(locale);
            const cols = buildCustomersColumns();
            expect(cols.find(c => c.field === 'readiness')).toBeUndefined();
            const col = cols.find(c => c.field === 'portalState')!;
            expect(CUSTOMERS_DEFAULT_HIDDEN).not.toContain('portalState');
            expect(col.sortField).toBe('portalState');
            expect(col.filterField).toBe('portalState');
            expect(col.filterOperators).toEqual(['eq', 'notEq']);
            expect(col.filterOptions?.map(o => o.value)).toEqual([
                'none',
                'invited',
                'verified',
                'active',
            ]);
            expect(col.header).toBe(locale === 'en' ? 'Portal' : 'Портал');
            expect(col.filterOptions?.map(o => o.label)).toEqual(
                locale === 'en'
                    ? ['No access', 'Invited', 'Verified, not signed in', 'Active']
                    : ['Нет доступа', 'Приглашён', 'Подтверждён, не входил', 'Активен'],
            );
            expect(cols.find(c => c.field === 'isActive')!.header).toBe(
                locale === 'en' ? 'Status in ERP' : 'Статус в ERP',
            );
        },
    );

    it('maps a state to a badge and hides unknown or hidden states', () => {
        expect(portalStateBadge('active')).toEqual({ variant: 'success', label: 'Active' });
        expect(portalStateBadge('none')?.variant).toBe('neutral');
        expect(portalStateBadge('')).toBeNull();
        expect(portalStateBadge('weird')).toBeNull();
    });

    it('sorts by portalState', () => {
        expect(CUSTOMERS_SORT_FIELDS).toContain('portalState');
    });
});

describe('customers views by portal state', () => {
    it('lists the five views and rejects the old ERP status ones', () => {
        expect(CUSTOMERS_VIEWS.map(v => v.key)).toEqual([
            'all',
            'none',
            'invited',
            'verified',
            'active',
        ]);
        expect(isCustomersView('inactive')).toBe(false);
    });

    it('round-trips a view and falls back to all for an unknown one', () => {
        const url = { ...CUSTOMERS_URL_DEFAULTS, view: 'invited' };
        expect(fromCustomersUrlState(url).filters.view).toBe('invited');
        expect(fromCustomersUrlState({ ...url, view: 'inactive' }).filters.view).toBe('all');
        expect(restoreCustomersFilters({ view: 'verified' }).view).toBe('verified');
        expect(restoreCustomersFilters({ view: 'inactive' }).view).toBe('all');
    });

    it('merges the view into the filter without replacing a builder portalState', () => {
        expect(viewFilter('all', undefined)).toBeUndefined();
        expect(viewFilter('none', undefined)).toEqual({ portalState: { eq: 'none' } });
        expect(viewFilter('active', { portalState: { notEq: 'none' } })).toEqual({
            portalState: { notEq: 'none' },
            _and: [{ portalState: { eq: 'active' } }],
        });
    });
});

describe('customers view counts request', () => {
    beforeEach(() => {
        adminApi.mockReset();
        adminApi.mockResolvedValue({
            all: { totalItems: 10 },
            none: { totalItems: 4 },
            invited: { totalItems: 3 },
            verified: { totalItems: 2 },
            active: { totalItems: 1 },
        });
    });

    it('narrows every alias by search and conditions, only the chips by their state', async () => {
        const counts = await fetchCustomersViewCounts({
            ...BLANK_CUSTOMERS_FILTERS,
            search: ' acme ',
            conditions: [{ columnKey: 'inn', operator: 'eq', value: '1' }],
        });
        const vars = adminApi.mock.calls[0][1];
        expect(Object.keys(vars)).toEqual(['all', 'none', 'invited', 'verified', 'active']);
        for (const v of Object.values<Record<string, unknown>>(vars)) {
            expect(v.take).toBe(0);
            expect(v.search).toBe('acme');
        }
        expect(vars.all.filter).toEqual({ inn: { eq: '1' } });
        expect(vars.invited.filter).toEqual({ inn: { eq: '1' }, portalState: { eq: 'invited' } });
        expect(counts).toEqual({ all: 10, none: 4, invited: 3, verified: 2, active: 1 });
    });
});

describe('password reset bulk operation', () => {
    afterEach(() => setLocale('en'));

    it('is registered with the portal access permission', () => {
        const ui = operationUi('counterparty-password-reset');
        expect(ui?.recordNoun).toBe('counterparties');
        expect(ui?.defaultParameters).toEqual({});
        expect(OPERATION_PERMISSIONS['counterparty-password-reset']).toBe(
            'ManageCounterpartyPortalAccess',
        );
    });

    it('translates the no_login skip reason', async () => {
        await setLocale('en');
        expect(reasonLabel('no_login')).toBe('No portal login to reset');
        await setLocale('ru');
        expect(reasonLabel('no_login')).toBe('Нет логина портала');
    });
});
