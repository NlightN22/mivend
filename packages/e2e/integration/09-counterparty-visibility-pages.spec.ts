import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import { select } from './contour-db';
import { superadminToken } from './price-type-access';
import {
    ACTORS,
    FIXTURES,
    actorCredentials,
    actorState,
    expectedIds,
    fixtureIds,
    type ActorState,
} from './branch-actors';
import { kpiActiveClients, openManagerAs, pageCount, searchClients } from './branch-pages';

interface Fixture {
    id: string;
    erpId: string;
    name: string;
}

let fixtures: Fixture[];

test.beforeAll(async () => {
    await superadminToken();
    const ids = fixtureIds([
        ...FIXTURES.branchA,
        ...FIXTURES.branchB,
        ...FIXTURES.noBranch,
        ...FIXTURES.inactive,
    ]);
    fixtures = select<Fixture>(
        `SELECT id::text AS id, "erpId", "shortName" AS name FROM counterparty WHERE id IN (${ids.join(',')}) ORDER BY id`,
    );
});

for (const actor of ACTORS) {
    test.describe(`9: ${actor.key} (${actor.role}, ${actor.scope} scope) in the manager portal`, () => {
        let state: ActorState;
        let expected: Set<string>;

        test.beforeAll(() => {
            if (!actorCredentials(actor.key)) return;
            state = actorState(actor);
            expected = expectedIds(actor, state);
        });
        test.beforeEach(() => {
            test.skip(
                !actorCredentials(actor.key),
                `STAGING_TEST_${actor.key.toUpperCase()}_* is not set`,
            );
        });

        test('list size and the active-clients KPI equal what the scope allows', async ({
            browser,
        }) => {
            const { context, page } = await openManagerAs(browser, actor.key);
            try {
                await page.goto('/customers');
                await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });
                await expect.poll(() => pageCount(page), { timeout: 15000 }).toBe(expected.size);
                const active = select<{ n: number }>(
                    `SELECT count(*)::int AS n FROM counterparty WHERE "isActive" AND id IN (${[...expected].join(',') || 'NULL'})`,
                )[0].n;
                await expect
                    .poll(() => kpiActiveClients(page).catch(() => -1), { timeout: 15000 })
                    .toBe(active);
            } finally {
                await context.close();
            }
        });

        test('search, detail page and CSV export show a fixture exactly when the scope allows it, and no response leaks the rest', async ({
            browser,
        }, testInfo) => {
            test.setTimeout(180_000);
            const hidden = fixtures.filter(f => !expected.has(f.id));
            if (actor.scope !== 'all')
                expect(hidden.length, 'a hidden fixture exists').toBeGreaterThan(0);
            const { context, page, log } = await openManagerAs(browser, actor.key);
            try {
                await page.goto('/customers');
                await expect(page.getByText('Client list')).toBeVisible({ timeout: 15000 });
                for (const f of fixtures) {
                    const shown = expected.has(f.id);
                    await searchClients(page, f.name);
                    const row = page.locator('.el-table-v2__row', { hasText: f.name });
                    if (shown) await expect(row.first(), `${f.name} in the list`).toBeVisible();
                    else await expect(row, `${f.name} in the list`).toHaveCount(0);
                    const [download] = await Promise.all([
                        page.waitForEvent('download'),
                        page.getByRole('button', { name: 'Export CSV' }).click(),
                    ]);
                    const csvPath = testInfo.outputPath(`export-${f.id}.csv`);
                    await download.saveAs(csvPath);
                    expect(
                        fs.readFileSync(csvPath, 'utf8').includes(f.name),
                        `${f.name} in the CSV`,
                    ).toBe(shown);
                }
                for (const f of fixtures) {
                    await page.goto(`/customers/${f.id}`);
                    const missing = page.getByText('Customer not found');
                    if (expected.has(f.id)) {
                        await expect(
                            page.getByText(f.name).first(),
                            `${f.name} detail`,
                        ).toBeVisible({ timeout: 15000 });
                    } else {
                        await expect(missing, `${f.name} detail is denied`).toBeVisible({
                            timeout: 15000,
                        });
                    }
                }
                await page.waitForTimeout(500);
                const all = log.bodies.join('\n');
                for (const f of hidden) {
                    expect(all.includes(f.name), `${f.name} in a GraphQL response`).toBe(false);
                    expect(all.includes(f.erpId), `${f.erpId} in a GraphQL response`).toBe(false);
                }
            } finally {
                await context.close();
            }
        });
    });
}
