import { describe, it, expect } from 'vitest';
import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useUrlState } from '../../../../ui-kit/src/composables/useUrlState';

describe('orders page URL state mapping', () => {
    it('maps status, q and page from the query with defaults for the rest', async () => {
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/orders', component: { render: () => null } }],
        });
        await router.push('/orders?status=delivered&q=77&page=2');
        const app = createApp({ render: () => null }).use(router);
        const { filters, page } = app.runWithContext(() =>
            useUrlState({ status: 'all', q: '' }, { typingKeys: ['q'] }),
        );
        expect(filters).toEqual({ status: 'delivered', q: '77' });
        expect(page.value).toBe(2);
    });
});
