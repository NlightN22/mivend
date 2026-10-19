import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { adminGql } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { loginAsManager } from '../helpers/manager-auth';
import { E2E_BROWSER_USER_AGENT } from '../helpers/user-agent';
import { select } from './contour-db';
import { loadContourEnv } from './contour-env';

export const MANAGER_MISSING_REASON =
    'STAGING_TEST_MANAGER_USERNAME/PASSWORD are not set in the staging-integration env file';

export interface PriceTypeSplit {
    allowed: string[];
    hidden: string[];
    confidential: string[];
}

// Expected manager view from the contour data: customer types of the branch allow-list plus its default.
export function expectedSplit(managerUsername: string): PriceTypeSplit {
    const all = select<{ id: string; code: string; visibility: string }>(
        `SELECT id::text, code, visibility FROM price_type`,
    );
    const branch = select<{ default: string; visible: string | null }>(
        `SELECT bs."defaultPriceTypeId"::text AS "default", bs."visiblePriceTypeIds" AS visible
         FROM administrator a JOIN "user" u ON u.id = a."userId"
         JOIN branch_settings bs ON bs."branchId"::text = a."customFieldsBranchid"
         WHERE u.identifier = '${managerUsername.replace(/'/g, "''")}'`,
    )[0];
    if (!branch) throw new Error('The test manager has no branch settings');
    const listed = new Set<string>([
        branch.default,
        ...(JSON.parse(branch.visible ?? '[]') as unknown[]).map(String),
    ]);
    const customer = all.filter(t => t.visibility === 'customer');
    return {
        allowed: customer.filter(t => listed.has(t.id)).map(t => t.code),
        hidden: all
            .filter(t => !(t.visibility === 'customer' && listed.has(t.id)))
            .map(t => t.code),
        confidential: all.filter(t => t.visibility === 'confidential').map(t => t.code),
    };
}

export async function managerToken(): Promise<string> {
    const { manager } = loadContourEnv();
    if (!manager) throw new Error(MANAGER_MISSING_REASON);
    return adminTokenFor(manager.username, manager.password);
}

export async function superadminToken(): Promise<string> {
    const { superadmin } = loadContourEnv();
    return adminTokenFor(superadmin.username, superadmin.password);
}

// The raw errors, so a denial is asserted instead of thrown.
export async function adminCall(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; errors: string[] }> {
    try {
        const { data } = await adminGql<Record<string, unknown>>(query, variables, token);
        return { data, errors: [] };
    } catch (error) {
        return { data: null, errors: [String(error)] };
    }
}

export async function openManagerPage(
    browser: Browser,
): Promise<{ context: BrowserContext; page: Page; log: GraphqlLog }> {
    const { manager, managerUrl } = loadContourEnv();
    if (!manager) throw new Error(MANAGER_MISSING_REASON);
    const context = await browser.newContext({
        baseURL: managerUrl,
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();
    const log = recordGraphql(page);
    await loginAsManager(page, manager.username, manager.password);
    return { context, page, log };
}

export interface GraphqlLog {
    bodies: string[];
    pending: () => number;
}

// Collects the text of every GraphQL response the page receives and counts the calls in flight.
export function recordGraphql(page: Page): GraphqlLog {
    const bodies: string[] = [];
    let inFlight = 0;
    const isGraphql = (url: string): boolean => /\/(admin|shop)-api/.test(url);
    page.on('request', request => {
        if (isGraphql(request.url())) inFlight++;
    });
    page.on('requestfailed', request => {
        if (isGraphql(request.url())) inFlight--;
    });
    page.on('response', response => {
        if (!isGraphql(response.url())) return;
        void response.text().then(
            text => bodies.push(text),
            () => undefined,
        );
        inFlight--;
    });
    return { bodies, pending: () => inFlight };
}

// Navigates and waits until the page's GraphQL calls have been answered and it shows text.
export async function visit(page: Page, log: GraphqlLog, path: string): Promise<string> {
    await page.goto(path);
    await expect
        .poll(
            async () => log.pending() === 0 && (await page.locator('body').innerText()).length > 0,
            {
                timeout: 30_000,
            },
        )
        .toBe(true);
    return page.locator('body').innerText();
}

export function codesFoundIn(text: string, codes: string[]): string[] {
    return codes.filter(code => text.includes(code));
}
