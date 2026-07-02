import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { postBatch, waitForRun } from './helpers/api';
import { loginAs } from './helpers/storefront-auth';
import { seedRecords, E2E_CUSTOMER } from './fixtures/seed';

const AUTH_DIR = path.join(__dirname, '.auth');
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

async function adminGql<T>(
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
): Promise<{ data: T; token?: string }> {
    const res = await fetch(`${SERVER_URL}/admin-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    const responseToken = res.headers.get('vendure-auth-token') ?? undefined;
    return { data: json.data, token: responseToken };
}

async function ensureShippingMethod(token: string): Promise<void> {
    const { data } = await adminGql<{ shippingMethods: { items: { id: string }[] } }>(
        `query { shippingMethods { items { id } } }`,
        undefined,
        token,
    );
    if (data.shippingMethods.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateShippingMethodInput!) { createShippingMethod(input: $input) { id } }`,
        {
            input: {
                code: 'free-shipping',
                fulfillmentHandler: 'manual-fulfillment',
                checker: {
                    code: 'default-shipping-eligibility-checker',
                    arguments: [{ name: 'orderMinimum', value: '0' }],
                },
                calculator: {
                    code: 'default-shipping-calculator',
                    arguments: [
                        { name: 'rate', value: '0' },
                        { name: 'includesTax', value: 'auto' },
                        { name: 'taxRate', value: '0' },
                    ],
                },
                translations: [{ languageCode: 'en', name: 'Free Shipping', description: '' }],
            },
        },
        token,
    );
}

async function ensureCustomerPriceType(
    token: string,
    customerEmail: string,
    priceTypeCode: string,
): Promise<void> {
    // erp-import's counterparty handler only assigns a Vendure CustomerGroup for
    // priceType — it does not populate plugin-customer-pricing's customer_price_type
    // table, which is what PriceEntryService.getPriceTypeCodeForUser() actually reads.
    // Bootstrap it directly here so customerPrice/compareAtPrice resolve correctly in
    // e2e tests (see docs/ai/PROJECT_CONTEXT.md known problems for the underlying gap).
    const { data: priceTypeData } = await adminGql<{ upsertPriceType: { id: string } }>(
        `mutation($code: String!, $name: String!) { upsertPriceType(code: $code, name: $name) { id } }`,
        { code: priceTypeCode, name: priceTypeCode },
        token,
    );

    const { data: customerData } = await adminGql<{
        customers: { items: { id: string }[] };
    }>(
        `query($email: String!) { customers(options: { filter: { emailAddress: { eq: $email } } }) { items { id } } }`,
        { email: customerEmail },
        token,
    );
    const customerId = customerData.customers.items[0]?.id;
    if (!customerId) return;

    await adminGql(
        `mutation($customerId: ID!, $priceTypeId: ID!) { setCustomerPriceType(customerId: $customerId, priceTypeId: $priceTypeId) { id } }`,
        { customerId, priceTypeId: priceTypeData.upsertPriceType.id },
        token,
    );
}

async function ensureCountry(token: string, code: string, name: string): Promise<void> {
    const { data } = await adminGql<{ countries: { items: { id: string }[] } }>(
        `query($code: String!) { countries(options: { filter: { code: { eq: $code } } }) { items { id } } }`,
        { code },
        token,
    );
    if (data.countries.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateCountryInput!) { createCountry(input: $input) { id } }`,
        { input: { code, translations: [{ languageCode: 'en', name }], enabled: true } },
        token,
    );
}

export default async function globalSetup(): Promise<void> {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { token: adminToken } = await adminGql<unknown>(
        `mutation($id: String!, $pw: String!) { login(username: $id, password: $pw) { ... on CurrentUser { id } } }`,
        { id: SUPERADMIN.identifier, pw: SUPERADMIN.password },
    );
    if (adminToken) {
        await ensureCountry(adminToken, 'RU', 'Russia');
        await ensureShippingMethod(adminToken);
    }

    const exchangeId = `e2e-seed-${Date.now()}`;
    await postBatch(exchangeId, seedRecords);
    await waitForRun(exchangeId);

    if (adminToken) {
        await ensureCustomerPriceType(adminToken, E2E_CUSTOMER.email, 'WHOLESALE');
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: STOREFRONT_URL });
    const page = await context.newPage();

    await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await context.storageState({ path: path.join(AUTH_DIR, 'storefront-user.json') });

    await browser.close();
}
