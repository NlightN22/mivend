import { test } from '@playwright/test';
import * as path from 'path';
import { loginAs } from '../helpers/storefront-auth';
import { gql } from '../storefront/orders/helpers';
import { loadContourEnv } from './contour-env';

export const CUSTOMER_STATE = path.join(__dirname, '../.auth/integration-customer.json');

// UI checkout rotates the session cookie (docs/e2e-testing.md gotcha 7): re-save it after each test.
export function keepCustomerSession(): void {
    test.beforeEach(async ({ page }) => {
        const data = (await gql(page, 'query { activeCustomer { id } }')) as {
            activeCustomer: unknown;
        };
        if (data.activeCustomer) return;
        const { customer } = loadContourEnv();
        await loginAs(page, customer.email, customer.password);
        await page.context().storageState({ path: CUSTOMER_STATE });
    });
    test.afterEach(async ({ page }) => {
        await page.context().storageState({ path: CUSTOMER_STATE });
    });
}
