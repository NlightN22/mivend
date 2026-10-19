import { test, expect } from '@playwright/test';
import { adminGql } from '../helpers/api';
import { select } from './contour-db';
import { loadContourEnv } from './contour-env';
import { keepCustomerSession } from './customer-session';
import {
    MANAGER_MISSING_REASON,
    codesFoundIn,
    expectedSplit,
    managerToken,
    openManagerPage,
    recordGraphql,
    splitGap,
    superadminToken,
    visit,
    type PriceTypeSplit,
} from './price-type-access';

keepCustomerSession();
test.describe.configure({ timeout: 120_000 });

const LEAKING_FIELDS = /"(floorPrice|purchasePrice|priceTypeCode|priceTypeErpId)"\s*:/;

test.describe('manager sees only allowed price types', () => {
    let split: PriceTypeSplit;
    let session: Awaited<ReturnType<typeof openManagerPage>> | undefined;

    test.beforeAll(async ({ browser }) => {
        const { manager } = loadContourEnv();
        if (!manager) return;
        split = expectedSplit(manager.username);
        session = await openManagerPage(browser);
    });
    test.afterAll(async () => {
        await session?.context.close();
    });
    test.beforeEach(() => {
        test.skip(!loadContourEnv().manager, MANAGER_MISSING_REASON);
        test.skip(!!splitGap(split), splitGap(split));
    });

    test('5: the contour data has hidden and confidential types, so the checks below can fail', () => {
        expect(split.allowed.length).toBeGreaterThan(0);
        expect(split.confidential.length).toBeGreaterThan(0);
        expect(split.hidden.length).toBeGreaterThan(split.confidential.length);
    });

    test('5: Admin API price type lists hold exactly the allowed codes', async () => {
        const token = await managerToken();
        const { data } = await adminGql<{
            priceTypes: { code: string; visibility: string }[];
            priceTypeCodes: string[];
        }>(`{ priceTypes { code visibility } priceTypeCodes }`, undefined, token);
        expect(data.priceTypes.map(t => t.code).sort()).toEqual([...split.allowed].sort());
        expect(data.priceTypeCodes.sort()).toEqual([...split.allowed].sort());
        expect(data.priceTypes.every(t => t.visibility === 'customer')).toBe(true);
    });

    test('5: the discounts page offers the allowed types in its price type filter', async () => {
        const { page, log } = session!;
        await visit(page, log, '/discounts');
        await page.getByRole('heading', { name: 'Grant registry' }).waitFor();
        const filter = page
            .locator('.mv-filter-field', { hasText: 'Price type' })
            .locator('select');
        await expect(filter).toBeVisible();
        await expect(filter.locator('option', { hasText: split.allowed[0] })).toHaveCount(1);
        const shown = (await filter.locator('option').allInnerTexts()).map(t => t.trim());
        for (const code of split.allowed) expect(shown, `option ${code}`).toContain(code);
        expect(codesFoundIn(shown.join('|'), split.hidden)).toEqual([]);
    });

    test('5: no manager portal page shows or receives a confidential price type', async () => {
        const { page, log } = session!;
        const customerId = select<{ id: string }>(
            `SELECT id::text FROM customer WHERE "emailAddress" = '${loadContourEnv().customer.email.replace(/'/g, "''")}'`,
        )[0].id;
        const paths = ['/', '/orders', '/customers', `/customers/${customerId}`, '/discounts'];
        paths.push('/catalog', '/approvals', '/proforma-invoices');
        const texts: string[] = [];
        for (const path of paths) texts.push(await visit(page, log, path));
        const product = await page.goto('/catalog').then(() =>
            page
                .locator('a[href*="/catalog/"]')
                .first()
                .getAttribute('href', { timeout: 10_000 })
                .catch(() => null),
        );
        if (product) texts.push(await visit(page, log, product));
        expect(texts.every(t => t.length > 0)).toBe(true);
        const bodies = log.bodies;
        expect(bodies.length, 'GraphQL responses were captured').toBeGreaterThan(paths.length);
        const everything = [...texts, ...bodies].join('\n');
        expect(codesFoundIn(everything, split.confidential)).toEqual([]);
        const allowedCodePairs = new RegExp(
            `"priceTypeCode"\\s*:\\s*"(${split.allowed.join('|')})"`,
            'g',
        );
        expect(everything.replace(allowedCodePairs, '')).not.toMatch(LEAKING_FIELDS);
    });

    test('5: the confidential types exist in the data, so their absence above is not an empty table', async () => {
        const { data } = await adminGql<{ priceTypes: { code: string }[] }>(
            `{ priceTypes { code } }`,
            undefined,
            await superadminToken(),
        );
        const existing = data.priceTypes.map(t => t.code);
        for (const code of split.confidential) expect(existing, `${code} exists`).toContain(code);
    });
});

test.describe('customer sees only their own price', () => {
    test('5: storefront responses carry the own-type price and no confidential data', async ({
        page,
    }) => {
        const log = recordGraphql(page);
        const bodies = log.bodies;
        const confidential = select<{ code: string }>(
            `SELECT code FROM price_type WHERE visibility = 'confidential'`,
        ).map(t => t.code);
        const { customer } = loadContourEnv();
        const { data } = await adminGql<{
            customers: { items: { priceType: { code: string } }[] };
        }>(
            `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) {
                items { priceType { code } } } }`,
            { e: customer.email },
            await superadminToken(),
        );
        const ownType = data.customers.items[0].priceType.code;
        expect(confidential).not.toContain(ownType);

        for (const path of ['/', '/catalog', '/cart', '/favorites', '/account']) {
            await visit(page, log, path);
        }
        const href = await page
            .goto('/catalog')
            .then(() => page.locator('a[href*="/product/"]').first().getAttribute('href'));
        const text = await visit(page, log, href as string);
        const variantId = select<{ id: string }>(
            `SELECT pv.id::text FROM product_variant pv JOIN product_translation pt ON pt."baseId" = pv."productId"
             WHERE pt.slug = '${(href as string).split('/').pop()!.replace(/'/g, "''")}' ORDER BY pv.id LIMIT 1`,
        )[0].id;
        const prices = select<{ code: string; price: string }>(
            `SELECT "priceTypeCode" AS code, price::text FROM product_variant_price_entry WHERE "variantId" = '${variantId}'`,
        );
        const own = prices.find(p => p.code === ownType);
        expect(own, `own price entry of ${ownType}`).toBeTruthy();
        expect(
            bodies.some(b => b.includes(`"sku":`) && b.includes(`"customerPrice":${own!.price}`)),
            `a storefront response carries the ${ownType} price ${own!.price}`,
        ).toBe(true);

        const everything = [text, ...bodies].join('\n');
        expect(codesFoundIn(everything, confidential)).toEqual([]);
        expect(everything).not.toMatch(LEAKING_FIELDS);
        const purchase = prices.find(p => confidential.includes(p.code));
        if (purchase && purchase.price !== own!.price)
            expect(everything).not.toContain(`:${purchase.price},`);
    });
});
