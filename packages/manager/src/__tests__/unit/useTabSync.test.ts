import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { flushPromises } from '@vue/test-utils';
import { useTabSync } from '../../composables/useTabSync';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: CustomerDetailPage.vue's tab-switch/URL-sync logic, extracted into
//   useTabSync so it's testable without mounting the whole page (auth store, GraphQL fetches).
// - Business invariants: (1) every real, user-initiated tab switch updates route.query.tab —
//   not just the first one; (2) a real switch drops any other query keys (another tab's own
//   filter params); (3) a route-driven change (browser back/forward, external navigation) never
//   itself triggers a router write, so it doesn't fight the switch it's reacting to; (4) an
//   invalid/missing `tab` query value falls back to the given default.
// - Data ownership/scope: none — pure client-side UI/URL state, no backend boundary.
// - Failure modes covered: (a) the exact regression reported live — alternating tab clicks
//   ("Orders", "Invoices", "Orders", "Invoices"...) must each update the URL, not just every
//   other one (this is what the old flag-based implementation got wrong); (b) a second, later
//   regression, also reported live: `activeTab` must not flip (mounting the next tab's
//   component) until *after* the query string is actually cleared — two tabs that happen to
//   both own a filter with the same key name (e.g. Payments' and Discounts' own, unrelated
//   `status` filters) must never let one leak into the other via a stale route.query read during
//   the async gap between "activeTab changed" and "router.replace resolved."
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply (no
//   CQRS/inbox/outbox/idempotency/concurrency) — this is a client state machine.
// - Test placement: unit/composable-level, via a real vue-router memory-history instance (more
//   faithful than hand-mocking route/router objects) driven through a real (but DOM-less) Vue
//   app via `app.runWithContext` — this package has no jsdom/happy-dom dependency installed, so
//   a full @vue/test-utils `mount()` isn't available; runWithContext calls useRoute()/useRouter()
//   in a real injection context without needing to render to a document.
// - Existing coverage reused: none — first router-dependent composable test in this package.
// - Deliberate omissions: no E2E spec; live Playwright checks during this session already
//   confirmed the fix end-to-end but aren't part of the committed suite.

type TestTab = 'overview' | 'orders' | 'invoices';
const TABS: readonly TestTab[] = ['overview', 'orders', 'invoices'];

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
    // No DOM available in this package (no jsdom/happy-dom) — runWithContext runs the composable
    // inside a real Vue app's injection context (so useRoute()/useRouter() resolve correctly)
    // without needing to actually mount anything to a document.
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
        const { state: s } = await setup('/customers/1?tab=invoices');
        expect(s.activeTab.value).toBe('invoices');
    });

    it('a real tab switch updates route.query.tab and drops any other query keys', async () => {
        await router.replace({ query: { tab: 'orders', code: '1002', totalMin: '1000' } });
        await flushPromises();

        await state.selectTab('invoices');
        await flushPromises();

        expect(router.currentRoute.value.query).toEqual({ tab: 'invoices' });
    });

    // The exact regression reported live: with the old flag-based implementation, only every
    // *other* click actually updated the URL — the flag meant to distinguish "user clicked" from
    // "route changed externally" got permanently stuck after the very first switch, because
    // Vue's watch() never refires from a same-value ref write.
    it('every switch in an alternating sequence updates the URL, not just every other one', async () => {
        const sequence: TestTab[] = ['orders', 'invoices', 'orders', 'invoices', 'orders'];

        for (const tab of sequence) {
            await state.selectTab(tab);
            await flushPromises();
            expect(router.currentRoute.value.query.tab).toBe(tab);
        }
    });

    // The second live-reported regression: `activeTab` must only flip once the query is already
    // clean, never before — otherwise the next tab's component mounts (per the template's
    // `v-else-if="activeTab === '<tab>'"`) and reads a stale, not-yet-cleared route.query itself.
    // Concretely reproduced live: Payments' own `status=chargeback` leaked into Discounts (a
    // table with no such status) purely because both tabs' `useUrlSyncedState` filter sets happen
    // to use the same key name `status` for two unrelated concepts.
    it('does not flip activeTab until router.replace has actually resolved', async () => {
        await router.replace({ query: { tab: 'orders', status: 'chargeback' } });
        await flushPromises();
        expect(state.activeTab.value).toBe('orders');

        // Don't await yet — activeTab must still read the *old* tab while the navigation is
        // in flight, proving the write order (query first, activeTab second), not just the
        // eventual end state.
        const switching = state.selectTab('invoices');
        expect(state.activeTab.value).toBe('orders');

        await switching;
        expect(state.activeTab.value).toBe('invoices');
        expect(router.currentRoute.value.query).toEqual({ tab: 'invoices' });
    });

    it('a route-driven change (e.g. browser back/forward) updates activeTab without rewriting the query', async () => {
        await router.replace({ query: { tab: 'orders', code: '1002' } });
        await flushPromises();

        // Simulate the browser restoring a prior history entry that still has other filter
        // params — this must be preserved verbatim, not stripped like a real selectTab() switch
        // would (that's the whole point of the route watcher being read-only).
        await router.replace({ query: { tab: 'invoices', search: '9' } });
        await flushPromises();

        expect(state.activeTab.value).toBe('invoices');
        expect(router.currentRoute.value.query).toEqual({ tab: 'invoices', search: '9' });
    });
});
