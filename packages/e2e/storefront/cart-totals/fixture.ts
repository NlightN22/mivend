import { test as base } from '@playwright/test';
import { clearCart } from './cart-helpers';

export const test = base.extend({
    page: async ({ page }, use) => {
        await clearCart(page);
        await use(page);
        await clearCart(page);
    },
});

export { expect } from '@playwright/test';
