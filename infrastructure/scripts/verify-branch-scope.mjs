// E2E verification of branch-scope access-control rules (docs/access-control.md's "Branch scope
// is a separate axis"). Automates the manual curl-based check performed live during the
// branch-identity/access-control design session — see docs/architecture.md and
// docs/access-control.md.
//
// Run against an already-running, already-seeded central instance: node infrastructure/scripts/verify-branch-scope.mjs
// Requires: make dev + make seed-all already run (cnt-001, olga.depthead@mivend.dev,
// nikolai.director@mivend.dev must exist).
//
// Deliberately does NOT reassign an existing administrator's branchId to test the "different
// branch" case — Vendure's default session cache (authOptions.sessionCacheTTL, several minutes)
// caches an administrator's resolved data, so flipping the same user's branchId and immediately
// re-checking in a fresh login can read stale cached scope, not the real DB value (this was
// hit and diagnosed live while writing this script). Instead creates a genuinely new, disposable
// Administrator scoped to the second branch — a brand-new user has no stale cache entry to hit —
// and deletes it in cleanup. Safe to run repeatedly, including CI.

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const ERP_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';
const PASSWORD = 'Password123!';
const VERIFY_EMAIL = 'verify-branch-scope@mivend.dev';

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
        `{ counterparties(options: { take: 50 }) { totalItems items { erpId branchId } } }`,
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

async function deleteVerifyAdminIfExists(superadminCookie) {
    const { data } = await adminGraphqlWithSession(
        `{ administrators(options: { filter: { emailAddress: { eq: "${VERIFY_EMAIL}" } } }) { items { id } } }`,
        undefined,
        superadminCookie,
    );
    const existing = data.administrators.items[0];
    if (existing) {
        await adminGraphqlWithSession(
            `mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`,
            { id: existing.id },
            superadminCookie,
        );
    }
}

async function createVerifyAdmin(superadminCookie) {
    const { data: rolesData } = await adminGraphqlWithSession(
        `{ roles(options: { take: 20 }) { items { id code } } }`,
        undefined,
        superadminCookie,
    );
    const role = rolesData.roles.items.find(r => r.code === 'department-head');
    if (!role) throw new Error('department-head role not found — run make seed-access-roles first');

    const { data } = await adminGraphqlWithSession(
        `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
        {
            input: {
                firstName: 'Verify',
                lastName: 'BranchScope',
                emailAddress: VERIFY_EMAIL,
                password: PASSWORD,
                roleIds: [role.id],
                customFields: { departmentId: 'dept-sales', branchId: 'branch-north-verify' },
            },
        },
        superadminCookie,
    );
    return data.createAdministrator.id;
}

async function main() {
    console.log('── Verifying branch-scope access control ──\n');

    console.log('Setting up: second branch + a counterparty scoped to it...');
    await postBatch('verify-branch-scope-setup', [
        { type: 'branch', data: { erpId: 'branch-north-verify', name: 'North Branch (verify)' } },
        {
            type: 'counterparty',
            data: {
                erpId: 'cnt-branch-north-verify',
                legalName: 'North Branch Verify Co',
                shortName: 'North Verify',
                creditLimit: 0,
                creditBalance: 0,
                paymentDelayDays: 0,
                priceType: 'RETAIL',
                isActive: true,
                departmentId: 'dept-sales',
                branchId: 'branch-north-verify',
            },
        },
    ]);

    const superadminCookie = await loginAs(
        process.env.SUPERADMIN_USERNAME ?? 'superadmin',
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
    );
    await deleteVerifyAdminIfExists(superadminCookie);
    await createVerifyAdmin(superadminCookie);

    try {
        console.log('\nScenario: department-head fixed on branch-central (olga, unchanged)...');
        const olgaCookie = await loginAs('olga.depthead@mivend.dev');
        const olgaView = await listCounterparties(olgaCookie);
        check(
            olgaView.items.every(c => c.branchId !== 'branch-north-verify'),
            'does NOT see the branch-north-verify counterparty',
        );
        check(olgaView.totalItems >= 3, 'still sees its own branch-central counterparties');

        console.log('\nScenario: a different department-head, scoped to branch-north-verify...');
        const verifyCookie = await loginAs(VERIFY_EMAIL);
        const verifyView = await listCounterparties(verifyCookie);
        check(
            verifyView.items.every(c => c.branchId === 'branch-north-verify'),
            'sees ONLY branch-north-verify counterparties',
        );
        check(
            verifyView.items.some(c => c.erpId === 'cnt-branch-north-verify'),
            'specifically sees the branch-north-verify counterparty',
        );

        console.log("\nScenario: general-director (scope 'all')...");
        const nikolaiCookie = await loginAs('nikolai.director@mivend.dev');
        const allView = await listCounterparties(nikolaiCookie);
        check(
            allView.items.some(c => c.branchId === 'branch-central') &&
                allView.items.some(c => c.branchId === 'branch-north-verify'),
            'sees counterparties from BOTH branches regardless of scope',
        );
    } finally {
        console.log('\nCleaning up...');
        await deleteVerifyAdminIfExists(superadminCookie);
    }

    console.log(`\n${failures === 0 ? '✓ All checks passed' : `✗ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
