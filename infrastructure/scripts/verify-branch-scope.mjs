// Verifies branch-scope access control for Counterparty (docs/access-control.md, "Branch scope is
// the only real filtering axis"): branchId is the only visibility filter, departmentId never gates.
//
// Run against a running, seeded central instance: make dev + make seed-all first (needs
// olga.depthead@mivend.dev and nikolai.director@mivend.dev, dept-sales mapped to branch-central).
// Creates one counterparty in an unmapped department and cleans its branch override up.

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const ERP_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const PASSWORD = 'Password123!';
const VERIFY_ERP_ID = 'cnt-dept-purchasing-verify';
const VISIBLE_BRANCH_ERP_ID = 'branch-central';

let failures = 0;

function check(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
    } else {
        console.error(`  ✗ ${message}`);
        failures++;
    }
}

async function adminGraphqlWithSession(query, variables, cookie) {
    const res = await fetch(`${BASE_URL}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    const rawSetCookie = res.headers.get('set-cookie');
    const sessionCookie = rawSetCookie
        ? rawSetCookie
              .split(',')
              .map(c => c.split(';')[0].trim())
              .join('; ')
        : cookie;
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, cookie: sessionCookie ?? cookie };
}

async function loginAs(email, password = PASSWORD) {
    const { cookie, data } = await adminGraphqlWithSession(
        `mutation($u: String!, $p: String!) {
            login(username: $u, password: $p) {
                ... on CurrentUser { id }
                ... on InvalidCredentialsError { message }
            }
        }`,
        { u: email, p: password },
    );
    if (data.login.message) throw new Error(`Login failed for ${email}: ${data.login.message}`);
    return cookie;
}

async function listCounterparties(cookie) {
    const { data } = await adminGraphqlWithSession(
        `{ counterparties(options: { take: 50 }) { totalItems items { erpId departmentId branchId } } }`,
        undefined,
        cookie,
    );
    return data.counterparties;
}

async function postBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ERP_TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    const json = await res.json();
    if (!res.ok || json.failed > 0) {
        throw new Error(`erp-import batch failed: ${JSON.stringify(json)}`);
    }
    return json;
}

async function findVerifyCounterpartyId(cookie) {
    const { data } = await adminGraphqlWithSession(
        `{ counterparties(options: { take: 200 }) { items { id erpId } } }`,
        undefined,
        cookie,
    );
    return data.counterparties.items.find(c => c.erpId === VERIFY_ERP_ID)?.id;
}

async function findBranchId(cookie, erpId) {
    const { data } = await adminGraphqlWithSession(`{ branches { id erpId } }`, undefined, cookie);
    const branch = data.branches.find(b => b.erpId === erpId);
    if (!branch) throw new Error(`branch ${erpId} not found — run make seed-all`);
    return branch.id;
}

async function setBranchOverride(cookie, counterpartyId, branchId) {
    await adminGraphqlWithSession(
        `mutation($id: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $id, branchId: $b) }`,
        { id: counterpartyId, b: branchId },
        cookie,
    );
}

async function main() {
    console.log('── Verifying branch-scope access control (departmentId never gates) ──\n');

    await postBatch('verify-branch-scope-setup', [
        {
            type: 'counterparty',
            data: {
                erpId: VERIFY_ERP_ID,
                legalName: 'Purchasing Dept Verify Co',
                shortName: 'Purchasing Verify',
                creditLimit: 0,
                creditBalance: 0,
                paymentDelayDays: 0,
                priceType: 'RETAIL',
                isActive: true,
                departmentId: 'dept-purchasing',
            },
        },
    ]);

    const superadminCookie = await loginAs(
        process.env.SUPERADMIN_USERNAME ?? 'superadmin',
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
    );
    const verifyId = await findVerifyCounterpartyId(superadminCookie);
    if (!verifyId) throw new Error(`${VERIFY_ERP_ID} not found after import`);
    const visibleBranchId = await findBranchId(superadminCookie, VISIBLE_BRANCH_ERP_ID);
    await setBranchOverride(superadminCookie, verifyId, null);

    try {
        const olgaCookie = await loginAs('olga.depthead@mivend.dev');
        const nikolaiCookie = await loginAs('nikolai.director@mivend.dev');

        console.log('Scenario: branch-scoped head, counterparty in an unmapped department...');
        const before = await listCounterparties(olgaCookie);
        check(before.totalItems >= 3, 'sees its own branch counterparties');
        check(
            before.items.every(c => c.erpId !== VERIFY_ERP_ID),
            'does NOT see the unmapped-department counterparty (no branch, deny by default)',
        );

        console.log("\nScenario: same counterparty, branch override to the head's branch...");
        await setBranchOverride(superadminCookie, verifyId, visibleBranchId);
        const after = await listCounterparties(olgaCookie);
        check(
            after.items.some(c => c.erpId === VERIFY_ERP_ID),
            'now sees it although its departmentId is still dept-purchasing — branchId is the filter',
        );

        console.log("\nScenario: general-director (scope 'all')...");
        const allView = await listCounterparties(nikolaiCookie);
        check(
            allView.items.some(c => c.departmentId === 'dept-sales') &&
                allView.items.some(c => c.departmentId === 'dept-purchasing'),
            'sees counterparties from BOTH departments regardless of scope',
        );
    } finally {
        console.log('\nCleaning up...');
        await setBranchOverride(superadminCookie, verifyId, null);
    }

    console.log(`\n${failures === 0 ? '✓ All checks passed' : `✗ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
