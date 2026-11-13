import { expect, test } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import type { VisIds } from '../../fixtures/visibility/ids';
import {
    ALLOWED_PRICE_TYPES,
    GRANTS,
    VIS_PRICE_TYPES,
    grantJustification,
} from '../../fixtures/visibility/plan';
import { openManagerAs, shot, superadminToken, visData, type Session } from '../session';

const LEAKING_FIELDS = /"(floorPrice|purchasePrice|priceTypeCode|priceTypeErpId)"\s*:/;
const ALLOWED = ALLOWED_PRICE_TYPES.a;
const HIDDEN = [VIS_PRICE_TYPES.b, VIS_PRICE_TYPES.confidential];

let ids: VisIds;
let confidential: string[];

test.beforeAll(async () => {
    ({ ids } = await visData());
    const token = await superadminToken();
    const { data } = await adminGql<{
        priceTypes: { code: string; visibility: string }[];
        discountRegistryPage: { items: { justification: string | null }[] };
    }>(
        `{ priceTypes { code visibility }
           discountRegistryPage(options: { take: 200 }) { items { justification } } }`,
        undefined,
        token,
    );
    confidential = data.priceTypes.filter(t => t.visibility === 'confidential').map(t => t.code);
    expect(confidential, 'the seed has a confidential type').toContain(
        VIS_PRICE_TYPES.confidential,
    );
    const justifications = data.discountRegistryPage.items.map(i => i.justification);
    for (const key of Object.keys(GRANTS) as (keyof typeof GRANTS)[])
        expect(justifications, `the ${key} grant exists`).toContain(grantJustification(key));
});

async function settle(s: Session, path: string): Promise<string> {
    await s.page.goto(path);
    await expect(s.page.locator('main')).not.toBeEmpty({ timeout: 15000 });
    await s.page.waitForLoadState('load');
    await expect(s.page.getByText(/Loading/i)).toHaveCount(0, { timeout: 15000 });
    return s.page.locator('body').innerText();
}

test.describe('05: manager-a (branch A) sees only allowed price types', () => {
    test('no manager portal page shows or receives a confidential price type', async ({
        browser,
    }) => {
        test.setTimeout(120_000);
        const s = await openManagerAs(browser, 'manager-a');
        try {
            const paths = ['/', '/orders', '/customers', `/customers/${ids.clients['a-own']}`];
            paths.push(
                '/discounts',
                '/discounts?source=requests',
                '/approvals',
                '/proforma-invoices',
                '/payments',
            );
            const texts: string[] = [];
            for (const path of paths) texts.push(await settle(s, path));
            expect(s.bodies.length, 'GraphQL responses were captured').toBeGreaterThan(
                paths.length,
            );
            const everything = [...texts, ...s.bodies].join('\n');
            for (const code of confidential) expect(everything, code).not.toContain(code);
            const allowedPairs = new RegExp(
                `"priceTypeCode"\\s*:\\s*(null|"(${ALLOWED.join('|')})")`,
                'g',
            );
            expect(everything.replace(allowedPairs, '')).not.toMatch(LEAKING_FIELDS);
        } finally {
            await s.context.close();
        }
    });

    test('the discounts filter offers exactly the allowed types', async ({ browser }) => {
        const s = await openManagerAs(browser, 'manager-a');
        try {
            await s.page.goto('/discounts?source=requests');
            await s.page.getByRole('heading', { name: 'Discounts', exact: true }).waitFor();
            await s.page
                .getByRole('button', { name: /Filter/ })
                .first()
                .click();
            await s.page.getByText('Price type', { exact: true }).last().click();
            const value = s.page.getByTestId('filter-editor').locator('select').nth(1);
            await expect(value.locator('option', { hasText: ALLOWED[0] })).toHaveCount(1);
            const offered = (await value
                .locator('option')
                .evaluateAll(o => o.map(e => (e as HTMLOptionElement).value))) as string[];
            expect(offered.filter(Boolean)).toEqual([...ALLOWED]);
        } finally {
            await s.context.close();
        }
    });
});

test.describe('07: discount grants of hidden price types', () => {
    test('the "New discount grant" form offers only the allowed codes', async ({ browser }) => {
        const s = await openManagerAs(browser, 'manager-a');
        try {
            await s.page.goto('/discounts?source=requests');
            await s.page.getByRole('button', { name: 'New discount grant' }).click();
            const form = s.page.locator('.discount-grant-form');
            const select = form.locator('label', { hasText: 'Price type' }).locator('select');
            await expect(select.locator('option', { hasText: ALLOWED[0] })).toHaveCount(1);
            const offered = (await select
                .locator('option')
                .evaluateAll(o =>
                    o.map(e => (e as HTMLOptionElement).value).filter(Boolean),
                )) as string[];
            expect(offered).toEqual([...ALLOWED]);
            for (const code of [...HIDDEN, ...confidential]) expect(offered).not.toContain(code);
            await shot(s.page, 'grant-form-manager-a');
            await form.getByRole('button', { name: 'Cancel' }).click();
        } finally {
            await s.context.close();
        }
    });

    test('the registry and approvals pages show only the allowed grant', async ({ browser }) => {
        const s = await openManagerAs(browser, 'manager-a');
        try {
            await s.page.goto(`/discounts?source=requests&filters=priceType:eq:${ALLOWED[0]}`);
            await expect
                .poll(() => s.bodies.join('\n').includes(grantJustification('allowed')), {
                    timeout: 15000,
                })
                .toBe(true);
            await shot(s.page, 'grant-registry-manager-a');
            await s.page.goto('/approvals');
            await s.page.getByRole('button', { name: /^All\b/ }).click();
            await expect
                .poll(() => s.bodies.join('\n').includes(grantJustification('allowed')), {
                    timeout: 15000,
                })
                .toBe(true);
            await shot(s.page, 'approvals-manager-a');
            const everything = [await s.page.locator('body').innerText(), ...s.bodies].join('\n');
            expect(everything).not.toContain(grantJustification('hidden'));
            expect(everything).not.toContain(grantJustification('confidential'));
            expect(everything).not.toContain(VIS_PRICE_TYPES.confidential);
        } finally {
            await s.context.close();
        }
    });
});
