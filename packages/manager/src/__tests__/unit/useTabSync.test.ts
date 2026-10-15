import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { flushPromises } from '@vue/test-utils';
import { useTabSync } from '../../composables/useTabSync';

// Pure client-side URL state with no backend, so there is no jsdom here and tests use memory history.
// Route-driven changes must never write back to the router, or they fight the switch that triggered them.

type TestTab = 'overview' | 'orders' | 'proformaInvoices';
const TABS: readonly TestTab[] = ['overview', 'orders', 'proformaInvoices'];

async function setup(initialPath: string): Promise<{
    router: Router;
    state: ReturnType<typeof useTabSync<TestTab>>;
}> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
    });
    await router.push(initialPath);
    await router.isReady();

    const app = createApp({ render: () => null });
    app.use(router);
    // No DOM in this package (no jsdom/happy-dom), so nothing is mounted to a document.
    // runWithContext still provides the injection context that useRoute()/useRouter() need.
    const state = app.runWithContext(() => useTabSync<TestTab>(TABS, 'overview'));

    return { router, state };
}

describe('useTabSync', () => {
    let router: Router;
    let state: ReturnType<typeof useTabSync<TestTab>>;

    beforeEach(async () => {
        ({ router, state } = await setup('/customers/1'));
    });

    it('falls back to the default tab when the query has no valid tab', () => {
        expect(state.activeTab.value).toBe('overview');
    });

    it('reads an initial valid tab from the query on mount', async () => {
        const { state: s } = await setup('/customers/1?tab=proformaInvoices');
        expect(s.activeTab.value).toBe('proformaInvoices');
    });

    it('a real tab switch updates route.query.tab and drops any other query keys', async () => {
        await router.replace({ query: { tab: 'orders', code: '1002', totalMin: '1000' } });
        await flushPromises();

        await state.selectTab('proformaInvoices');
        await flushPromises();

        expect(router.currentRoute.value.query).toEqual({ tab: 'proformaInvoices' });
    });

    // A flag-based guard got stuck after the first switch: watch() doesn't refire on same-value writes.
    it('every switch in an alternating sequence updates the URL, not just every other one', async () => {
        const sequence: TestTab[] = [
            'orders',
            'proformaInvoices',
            'orders',
            'proformaInvoices',
            'orders',
        ];

        for (const tab of sequence) {
            await state.selectTab(tab);
            await flushPromises();
            expect(router.currentRoute.value.query.tab).toBe(tab);
        }
    });

    // activeTab must flip only after the query is cleared; otherwise the next tab mounts and reads
    // a stale route.query, so same-named filter keys (e.g. both tabs' status) leak across tabs.
    it('does not flip activeTab until router.replace has actually resolved', async () => {
        await router.replace({ query: { tab: 'orders', status: 'chargeback' } });
        await flushPromises();
        expect(state.activeTab.value).toBe('orders');

        // Not awaited on purpose: activeTab must still read the old tab mid-navigation, proving write order.
        const switching = state.selectTab('proformaInvoices');
        expect(state.activeTab.value).toBe('orders');

        await switching;
        expect(state.activeTab.value).toBe('proformaInvoices');
        expect(router.currentRoute.value.query).toEqual({ tab: 'proformaInvoices' });
    });

    it('a route-driven change (e.g. browser back/forward) updates activeTab without rewriting the query', async () => {
        await router.replace({ query: { tab: 'orders', code: '1002' } });
        await flushPromises();

        // History restore must keep other filter params verbatim; only a real selectTab() strips them.
        await router.replace({ query: { tab: 'proformaInvoices', search: '9' } });
        await flushPromises();

        expect(state.activeTab.value).toBe('proformaInvoices');
        expect(router.currentRoute.value.query).toEqual({ tab: 'proformaInvoices', search: '9' });
    });
});
