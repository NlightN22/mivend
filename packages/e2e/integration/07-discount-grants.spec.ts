import { test, expect } from '@playwright/test';
import { select } from './contour-db';
import { loadContourEnv } from './contour-env';
import { closeRunGrants } from './grant-cleanup';
import {
    MANAGER_MISSING_REASON,
    adminCall,
    expectedSplit,
    managerToken,
    openManagerPage,
    splitGap,
    superadminToken,
    visit,
    type PriceTypeSplit,
} from './price-type-access';
import { grantMarker, rememberGrantRequest } from './run-state';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const REQUEST = `mutation($i: DiscountGrantInput!) { requestDiscountGrant(input: $i) { id status } }`;
const REGISTRY = `{ discountRegistryPage(options: { take: 100 }) { items { approvalRequestId priceTypeCode status justification } } }`;
const INBOX = `{ myApprovalsInbox(allInvolvedOptions: { take: 100, requestType: "discountGrantApproval" },
    awaitingOptions: { take: 100, requestType: "discountGrantApproval" }) {
    allInvolved { items { id payload } } awaitingMyDecision { items { id payload } } } }`;

let split: PriceTypeSplit;
let session: Awaited<ReturnType<typeof openManagerPage>> | undefined;
let allowedCode: string;
let hiddenCustomerCode: string | undefined;
let confidentialCode: string | undefined;
const tag = (name: string): string => `${grantMarker()}-${name}-${Date.now().toString(36)}`;
const justifications = { allowed: '', hidden: '', confidential: '' };
const requestIds = { allowed: '', hidden: '', confidential: '' };

function input(priceTypeCode: string, justification: string): Record<string, unknown> {
    const day = 24 * 3600 * 1000;
    return {
        priceTypeCode,
        percent: 1,
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 30 * day).toISOString(),
        justification,
    };
}

function requestsWithMarker(): number {
    return select<{ n: number }>(
        `SELECT count(*)::int AS n FROM approval_request WHERE payload LIKE '%${grantMarker()}%'`,
    )[0].n;
}

test.beforeAll(async ({ browser }) => {
    const { manager } = loadContourEnv();
    if (!manager) return;
    split = expectedSplit(manager.username);
    allowedCode = split.allowed.find(c => c !== split.defaultCode) ?? split.allowed[0];
    hiddenCustomerCode = split.hidden.find(c => !split.confidential.includes(c));
    confidentialCode = split.confidential[0];
    session = await openManagerPage(browser);
});
test.afterAll(async () => {
    await session?.context.close();
    const left = await closeRunGrants();
    expect(left, 'grant requests still pending after cleanup').toEqual([]);
});
function skipWithoutHiddenTypes(): void {
    test.skip(
        !(hiddenCustomerCode && confidentialCode),
        'the contour has no hidden customer price type or no confidential price type',
    );
}

test.beforeEach(() => {
    test.skip(!loadContourEnv().manager, MANAGER_MISSING_REASON);
    test.skip(!!splitGap(split), splitGap(split));
    test.skip(
        select<{ n: number }>(
            `SELECT count(*)::int AS n FROM workflow_definition WHERE "requestType" = 'discountGrantApproval'`,
        )[0].n === 0,
        'no approval workflow is registered for discount grants on this contour',
    );
});

test('7: the manager submits a grant for an allowed type in the portal, and only allowed types are offered', async () => {
    const { page } = session!;
    justifications.allowed = tag('allowed');
    await page.goto('/discounts');
    await page.getByRole('button', { name: 'New discount grant' }).click();
    const form = page.locator('.discount-grant-form');
    const typeSelect = form.locator('label', { hasText: 'Price type' }).locator('select');
    await expect(typeSelect.locator('option', { hasText: allowedCode })).toHaveCount(1, {
        timeout: 60_000,
    });
    const offered = (await typeSelect.locator('option').allInnerTexts()).map(t => t.trim());
    for (const code of split.hidden) expect(offered, `offered ${code}`).not.toContain(code);

    await typeSelect.selectOption(allowedCode);
    await form.locator('label', { hasText: 'Discount %' }).locator('input').fill('1');
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await form.locator('label', { hasText: 'Valid from' }).locator('input').fill(from);
    await form.locator('label', { hasText: 'Valid to' }).locator('input').fill(to);
    await form.locator('textarea').fill(justifications.allowed);
    const response = page.waitForResponse(
        r =>
            r.url().includes('admin-api') &&
            (r.request().postData() ?? '').includes('requestDiscountGrant'),
    );
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    const body = (await (await response).json()) as {
        data?: { requestDiscountGrant?: { id: string } };
        errors?: { message: string }[];
    };
    expect(body.errors?.[0]?.message).toBeUndefined();
    requestIds.allowed = body.data!.requestDiscountGrant!.id;
    rememberGrantRequest(requestIds.allowed);
    await expect(page.locator('.el-table-v2__row', { hasText: allowedCode }).first()).toBeVisible();
    expect(
        select<{ status: string }>(
            `SELECT status FROM approval_request WHERE id = ${Number(requestIds.allowed)}`,
        )[0].status,
    ).toBe('pending');
});

test('7: the manager cannot request a grant for a hidden or confidential type, and nothing is created', async () => {
    skipWithoutHiddenTypes();
    const token = await managerToken();
    const before = requestsWithMarker();
    for (const code of [hiddenCustomerCode!, confidentialCode!]) {
        const result = await adminCall(token, REQUEST, {
            i: input(code, tag('denied')),
        });
        expect(result.errors.join(), `request for ${code}`).toMatch(
            /not currently authorized|forbidden/i,
        );
        expect(result.data).toBeNull();
    }
    expect(requestsWithMarker(), 'no request row was created by the denied calls').toBe(before);
});

test('7: grants of hidden types created by the superadmin exist but are invisible to the manager', async () => {
    skipWithoutHiddenTypes();
    const admin = await superadminToken();
    for (const [key, code] of [
        ['hidden', hiddenCustomerCode!],
        ['confidential', confidentialCode!],
    ] as const) {
        justifications[key] = tag(key);
        const created = await adminCall(admin, REQUEST, { i: input(code, justifications[key]) });
        expect(created.errors, `superadmin request for ${code}`).toEqual([]);
        requestIds[key] = (
            created.data as { requestDiscountGrant: { id: string } }
        ).requestDiscountGrant.id;
        rememberGrantRequest(requestIds[key]);
    }
    const seenByAdmin = await adminCall(admin, REGISTRY);
    const adminIds = (
        seenByAdmin.data as { discountRegistryPage: { items: { approvalRequestId: string }[] } }
    ).discountRegistryPage.items.map(i => i.approvalRequestId);
    expect(adminIds).toEqual(expect.arrayContaining(Object.values(requestIds)));

    const manager = await managerToken();
    const registry = await adminCall(manager, REGISTRY);
    expect(registry.errors).toEqual([]);
    const items = (
        registry.data as {
            discountRegistryPage: { items: { approvalRequestId: string; priceTypeCode: string }[] };
        }
    ).discountRegistryPage.items;
    expect(items.map(i => i.approvalRequestId)).toContain(requestIds.allowed);
    expect(items.map(i => i.approvalRequestId)).not.toContain(requestIds.hidden);
    expect(items.map(i => i.approvalRequestId)).not.toContain(requestIds.confidential);
    for (const code of split.hidden) expect(items.map(i => i.priceTypeCode)).not.toContain(code);
});

test('7: the approvals inbox and request lookups hide the hidden grants from the manager', async () => {
    skipWithoutHiddenTypes();
    const manager = await managerToken();
    const inbox = await adminCall(manager, INBOX);
    expect(inbox.errors).toEqual([]);
    const text = JSON.stringify(inbox.data);
    expect(text).toContain(justifications.allowed);
    expect(text).not.toContain(justifications.hidden);
    expect(text).not.toContain(justifications.confidential);

    const byType = await adminCall(
        manager,
        `{ approvalRequestsByType(requestType: "discountGrantApproval", options: { take: 100 }) {
            items { id payload } } }`,
    );
    const listed = JSON.stringify(byType.data) + byType.errors.join();
    expect(listed).not.toContain(justifications.hidden);
    expect(listed).not.toContain(justifications.confidential);

    for (const key of ['hidden', 'confidential'] as const) {
        const one = await adminCall(
            manager,
            `query($id: ID!) { approvalRequest(id: $id) { id payload } }`,
            { id: requestIds[key] },
        );
        expect(JSON.stringify(one.data) + one.errors.join(), `${key} request lookup`).not.toContain(
            justifications[key],
        );
    }
});

test('7: the portal registry and approvals pages show the allowed grant and none of the hidden ones', async () => {
    skipWithoutHiddenTypes();
    const { page, log } = session!;
    const registry = await visit(page, log, '/discounts');
    expect(registry).toContain(allowedCode);
    await page
        .getByPlaceholder('Price type, product group or customer...')
        .fill(hiddenCustomerCode!);
    await expect(page.getByText(/No discount grants/i)).toBeVisible();
    const approvals = await visit(page, log, '/approvals');
    const everything = [registry, approvals, ...log.bodies].join('\n');
    expect(everything).not.toContain(justifications.hidden);
    expect(everything).not.toContain(justifications.confidential);
    expect(everything).not.toContain(confidentialCode!);
    expect(log.bodies.join('\n')).toContain(justifications.allowed);
});

test('7: closing the grants leaves nothing pending', async () => {
    expect(await closeRunGrants()).toEqual([]);
    const ids = Object.values(requestIds).filter(Boolean).map(Number);
    if (ids.length === 0) return;
    const rows = select<{ status: string }>(
        `SELECT status FROM approval_request WHERE id IN (${ids.join(',')})`,
    );
    expect(rows).toHaveLength(ids.length);
    expect(rows.every(r => r.status === 'rejected')).toBe(true);
});
