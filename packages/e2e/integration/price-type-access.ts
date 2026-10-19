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
    defaultCode: string | undefined;
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
        defaultCode: all.find(t => t.id === branch.default)?.code,
        allowed: customer.filter(t => listed.has(t.id)).map(t => t.code),
        hidden: all
            .filter(t => !(t.visibility === 'customer' && listed.has(t.id)))
            .map(t => t.code),
        confidential: all.filter(t => t.visibility === 'confidential').map(t => t.code),
    };
}

// A reason to skip when the contour cannot make a denial claim non-vacuous: needs one allowed and one hidden type.
export function splitGap(split: PriceTypeSplit | undefined): string | undefined {
    if (!split) return undefined;
    if (split.allowed.length === 0)
        return 'the test manager has no allowed customer price type on this contour';
    if (split.hidden.length === 0)
        return 'the contour has no hidden price type for the test manager';
    return undefined;
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
    diagnostics: string[];
    pending: () => number;
}

// Collects the text of every GraphQL response, counts the calls in flight and keeps what a blank page needs explained.
export function recordGraphql(page: Page): GraphqlLog {
    const bodies: string[] = [];
    const diagnostics: string[] = [];
    let inFlight = 0;
    const isGraphql = (url: string): boolean => /\/(admin|shop)-api/.test(url);
    page.on('request', request => {
        if (isGraphql(request.url())) inFlight++;
    });
    page.on('requestfailed', request => {
        diagnostics.push(`requestfailed ${request.url()} ${request.failure()?.errorText}`);
        if (isGraphql(request.url())) inFlight--;
    });
    page.on('response', response => {
        if (response.status() >= 400)
            diagnostics.push(`http ${response.status()} ${response.url()}`);
        if (!isGraphql(response.url())) return;
        void response.text().then(
            text => bodies.push(text),
            () => undefined,
        );
        inFlight--;
    });
    page.on('console', message => {
        const text = message.text();
        if (message.type() === 'error' || message.type() === 'warning' || text.startsWith('[vite]'))
            diagnostics.push(`console.${message.type()} ${text}`);
    });
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) diagnostics.push(`navigated ${frame.url()}`);
    });
    page.on('pageerror', error => diagnostics.push(`pageerror ${String(error)}`));
    return { bodies, diagnostics, pending: () => inFlight };
}

function describeDiagnostics(items: string[]): string {
    if (items.length === 0) return 'no browser errors';
    const kept = items.length <= 10 ? items : [...items.slice(0, 5), '...', ...items.slice(-5)];
    return kept.join(' | ');
}

// Navigates and waits until the page's GraphQL calls have been answered and it shows text.
// A blank page is a defect to explain, not to retry: the failure carries what the browser reported.
export async function visit(page: Page, log: GraphqlLog, path: string): Promise<string> {
    await page.goto(path);
    try {
        await expect
            .poll(
                async () =>
                    log.pending() <= 0 && (await page.locator('body').innerText()).length > 0,
                { timeout: 30_000 },
            )
            .toBe(true);
    } catch (error) {
        throw new Error(
            `${path} did not render (url ${page.url()}, in flight ${log.pending()}): ${describeDiagnostics(log.diagnostics)}\n${String(error)}`,
        );
    }
    return page.locator('body').innerText();
}

export function codesFoundIn(text: string, codes: string[]): string[] {
    return codes.filter(code => text.includes(code));
}
