import { describe, it, expect, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useUrlState } from '../../composables/useUrlState';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';

async function setup(url: string) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/list', component: { render: () => null } }],
    });
    await router.push(url);
    const app = createApp({ render: () => null }).use(router);
    return { router, run: <T>(fn: () => T): T => app.runWithContext(fn) };
}

const defaults = { status: 'all', q: '' };

describe('useUrlState', () => {
    it('initialises filters and page from the URL', async () => {
        const { run } = await setup('/list?status=paid&q=ab&page=3');
        const { filters, page } = run(() => useUrlState(defaults));
        expect(filters).toEqual({ status: 'paid', q: 'ab' });
        expect(page.value).toBe(3);
    });

    it('omits defaults, keeps foreign keys and resets page on filter change', async () => {
        const { run, router } = await setup('/list?tab=x&page=2');
        const { filters, page } = run(() => useUrlState(defaults));
        filters.status = 'paid';
        await nextTick();
        await vi.waitFor(() => expect(router.currentRoute.value.query.status).toBe('paid'));
        expect(page.value).toBe(1);
        expect(router.currentRoute.value.query).toEqual({ tab: 'x', status: 'paid' });
        filters.status = 'all';
        await vi.waitFor(() => expect(router.currentRoute.value.query.status).toBeUndefined());
        expect(router.currentRoute.value.query).toEqual({ tab: 'x' });
    });

    it('pushes for filters and page, replaces for typing', async () => {
        const { run, router } = await setup('/list');
        const push = vi.spyOn(router, 'push');
        const replace = vi.spyOn(router, 'replace');
        const { filters, page } = run(() => useUrlState(defaults, { typingKeys: ['q'] }));
        filters.q = 'abc';
        await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
        expect(push).not.toHaveBeenCalled();
        filters.status = 'paid';
        await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        page.value = 2;
        await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2));
        expect(router.currentRoute.value.query).toEqual({ q: 'abc', status: 'paid', page: '2' });
    });

    it('restores state on back and forward', async () => {
        const { run, router } = await setup('/list');
        const { filters, page } = run(() => useUrlState(defaults));
        filters.status = 'paid';
        await vi.waitFor(() => expect(router.currentRoute.value.query.status).toBe('paid'));
        page.value = 2;
        await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBe('2'));
        router.back();
        await vi.waitFor(() => expect(page.value).toBe(1));
        expect(filters.status).toBe('paid');
        router.back();
        await vi.waitFor(() => expect(filters.status).toBe('all'));
    });
});

describe('useUrlSyncedState', () => {
    it('toQuery replaces by default and pushQuery pushes', async () => {
        const { run, router } = await setup('/list?tab=x');
        const push = vi.spyOn(router, 'push');
        const replace = vi.spyOn(router, 'replace');
        const sync = run(() => useUrlSyncedState(defaults));
        const page = { value: 1 };
        sync.toQuery({ status: 'paid', q: '' }, page as never);
        sync.pushQuery({ status: 'void', q: '' }, page as never);
        expect(replace).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledTimes(1);
    });
});
