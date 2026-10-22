import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import { adminGql } from '../../helpers/api';
import type { VisIds } from '../../fixtures/visibility/ids';
import {
    ACTORS,
    CLIENTS,
    VISIBLE_CLIENTS,
    clientErpId,
    clientName,
} from '../../fixtures/visibility/plan';
import { expectNotReceived, openManagerAs, shot, superadminToken, visData } from '../session';

let ids: VisIds;
let total: { all: number; active: number };

test.beforeAll(async () => {
    ids = (await visData()).ids;
    const { data } = await adminGql<{
        all: { totalItems: number };
        active: { totalItems: number };
    }>(
        `{ all: counterparties(options: { take: 1 }) { totalItems }
           active: counterparties(options: { take: 1, status: "active" }) { totalItems } }`,
        undefined,
        await superadminToken(),
    );
    total = { all: data.all.totalItems, active: data.active.totalItems };
});

async function listCount(page: Page): Promise<number> {
    const text = await page
        .getByText(/\d+–\d+ of \d+|0–0 of 0/)
        .first()
        .innerText();
    return Number(/of (\d+)/.exec(text)?.[1] ?? -1);
}

async function activeKpi(page: Page): Promise<number> {
    const match = /Active clients\s+(\d[\d\s,]*)/.exec(await page.locator('main').innerText());
    return match ? Number(match[1].replace(/\D/g, '')) : -1;
}

async function search(page: Page, text: string): Promise<void> {
    const answered = page.waitForResponse(
        r => r.url().includes('/admin-api') && (r.request().postData() ?? '').includes(text),
    );
    await page.getByPlaceholder('Company name or INN...').fill(text);
    await answered;
}

for (const actor of ACTORS) {
    const visible = new Set(VISIBLE_CLIENTS[actor.key]);
    const hidden = CLIENTS.filter(c => !visible.has(c.key)).map(c => c.key);

    test.describe(`09: ${actor.key} (${actor.role}) on the customers pages`, () => {
        test('list size and the active-clients KPI match the scope', async ({ browser }) => {
            const all = actor.key === 'director';
            const s = await openManagerAs(browser, actor.key);
            try {
                await s.page.goto('/customers');
                await expect(s.page.getByText('Client list')).toBeVisible({ timeout: 15000 });
                await expect
                    .poll(() => listCount(s.page), { timeout: 15000 })
                    .toBe(all ? total.all : visible.size);
                await expect
                    .poll(() => activeKpi(s.page), { timeout: 15000 })
                    .toBe(all ? total.active : visible.size);
                await shot(s.page, `customers-${actor.key}`);
            } finally {
                await s.context.close();
            }
        });

        test('search, CSV export and the detail page show a client exactly when the scope allows', async ({
            browser,
        }, testInfo) => {
            test.setTimeout(120_000);
            if (actor.key !== 'director') expect(hidden.length).toBeGreaterThan(0);
            const s = await openManagerAs(browser, actor.key);
            try {
                await s.page.goto('/customers');
                await expect(s.page.getByText('Client list')).toBeVisible({ timeout: 15000 });
                for (const c of CLIENTS) {
                    const shown = visible.has(c.key);
                    await search(s.page, clientName(c.key));
                    await expect
                        .poll(() => listCount(s.page), { timeout: 15000 })
                        .toBe(shown ? 1 : 0);
                    const row = s.page.locator('.el-table-v2__row', { hasText: clientName(c.key) });
                    await expect(row).toHaveCount(shown ? 1 : 0);
                    const [download] = await Promise.all([
                        s.page.waitForEvent('download'),
                        s.page.getByRole('button', { name: 'Export CSV' }).click(),
                    ]);
                    const csv = testInfo.outputPath(`${actor.key}-${c.key}.csv`);
                    await download.saveAs(csv);
                    expect(
                        fs.readFileSync(csv, 'utf8').includes(clientName(c.key)),
                        `${c.key} in CSV`,
                    ).toBe(shown);
                }
                for (const c of CLIENTS) {
                    await s.page.goto(`/customers/${ids.clients[c.key]}`);
                    const target = visible.has(c.key)
                        ? s.page.getByRole('heading', { name: clientName(c.key) })
                        : s.page.getByText('Customer not found');
                    await expect(target.first(), `${c.key} detail`).toBeVisible({ timeout: 15000 });
                }
                await expectNotReceived(
                    s,
                    hidden.flatMap(key => [clientName(key), clientErpId(key)]),
                );
            } finally {
                await s.context.close();
            }
        });
    });
}
