// E2E verification of department-scope access-control rules for Counterparty
// (docs/access-control.md's "Branch scope is a separate axis" / "Branch is mivend's own entity;
// Department is a pure 1C mirror" sections). Automates the manual curl-based check performed
// live during the branch-identity/access-control design session — see docs/architecture.md and
// docs/access-control.md.
//
// Run against an already-running, already-seeded central instance: node infrastructure/scripts/verify-branch-scope.mjs
// Requires: make dev + make seed-all already run (cnt-001, olga.depthead@mivend.dev,
// nikolai.director@mivend.dev, dept-purchasing must exist).
//
// Renamed in spirit from its original "branch scope" name (kept as the filename for history) —
// Counterparty is now correctly NEVER filtered by branchId (see
// CounterpartyService.findVisible's own comment; this used to be a live bug, fixed once
// Administrator.customFields.branchId/Counterparty.branchId stopped coincidentally holding the
// same raw ERP id). This script instead verifies: (1) departmentId is still the real scope
// filter, and (2) branchId is deliberately NOT a filter — two administrators in the same
// department but with different (or no) branchId assignments must see the exact same
// counterparties.
//
// Deliberately does NOT reassign an existing administrator's departmentId to test the
// "different department" case — Vendure's default session cache (authOptions.sessionCacheTTL,
// several minutes) caches an administrator's resolved data, so flipping the same user's
// departmentId and immediately re-checking in a fresh login can read stale cached scope, not the
// real DB value (this was hit and diagnosed live while writing the original version of this
// script, then for branchId). Instead creates genuinely new, disposable Administrators — a
// brand-new user has no stale cache entry to hit — and deletes them in cleanup. Safe to run
// repeatedly, including CI.

const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const ERP_TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';
const PASSWORD = 'Password123!';
const VERIFY_OTHER_DEPT_EMAIL = 'verify-other-dept@mivend.dev';
const VERIFY_SAME_DEPT_DIFFERENT_BRANCH_EMAIL = 'verify-same-dept-diff-branch@mivend.dev';

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

async function deleteVerifyAdminIfExists(superadminCookie, email) {
    const { data } = await adminGraphqlWithSession(
        `{ administrators(options: { filter: { emailAddress: { eq: "${email}" } } }) { items { id } } }`,
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

async function createVerifyAdmin(superadminCookie, email, customFields) {
    const { data: rolesData } = await adminGraphqlWithSession(
        `{ roles(options: { take: 20 }) { items { id code } } }`,
        undefined,
        superadminCookie,
    );
    const role = rolesData.roles.items.find(r => r.code === 'department-head');
    if (!role) throw new Error('department-head role not found — roles self-provision at server boot (issue #134), check the server started correctly');

    const { data } = await adminGraphqlWithSession(
        `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
        {
            input: {
                firstName: 'Verify',
                lastName: 'DeptScope',
                emailAddress: email,
                password: PASSWORD,
                roleIds: [role.id],
                customFields,
            },
        },
        superadminCookie,
    );
    return data.createAdministrator.id;
}

async function main() {
    console.log('── Verifying department-scope access control (branchId is NOT a filter) ──\n');

    console.log('Setting up: a counterparty in a different department (dept-purchasing)...');
    await postBatch('verify-dept-scope-setup', [
        {
            type: 'counterparty',
            data: {
                erpId: 'cnt-dept-purchasing-verify',
                legalName: 'Purchasing Dept Verify Co',
                shortName: 'Purchasing Verify',
                creditLimit: 0,
                creditBalance: 0,
                paymentDelayDays: 0,
                priceType: 'RETAIL',
                isActive: true,
                departmentId: 'dept-purchasing',
                // branchId intentionally omitted — Counterparty.branchId is never set by any
                // automatic path today (see docs/access-control.md, issue #65).
            },
        },
    ]);

    const superadminCookie = await loginAs(
        process.env.SUPERADMIN_USERNAME ?? 'superadmin',
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
    );
    await deleteVerifyAdminIfExists(superadminCookie, VERIFY_OTHER_DEPT_EMAIL);
    await deleteVerifyAdminIfExists(superadminCookie, VERIFY_SAME_DEPT_DIFFERENT_BRANCH_EMAIL);
    await createVerifyAdmin(superadminCookie, VERIFY_OTHER_DEPT_EMAIL, {
        departmentId: 'dept-purchasing',
    });
    // Same department as olga (dept-sales), but a deliberately different branchId — this is the
    // regression check: branchId must never narrow Counterparty visibility.
    await createVerifyAdmin(superadminCookie, VERIFY_SAME_DEPT_DIFFERENT_BRANCH_EMAIL, {
        departmentId: 'dept-sales',
        branchId: 'a-branch-id-olga-does-not-have',
    });

    try {
        console.log('\nScenario: department-head in dept-sales (olga, unchanged)...');
        const olgaCookie = await loginAs('olga.depthead@mivend.dev');
        const olgaView = await listCounterparties(olgaCookie);
        check(
            olgaView.items.every(c => c.erpId !== 'cnt-dept-purchasing-verify'),
            'does NOT see the dept-purchasing counterparty',
        );
        check(olgaView.totalItems >= 3, 'still sees its own dept-sales counterparties');

        console.log('\nScenario: department-head in a different department (dept-purchasing)...');
        const otherDeptCookie = await loginAs(VERIFY_OTHER_DEPT_EMAIL);
        const otherDeptView = await listCounterparties(otherDeptCookie);
        check(
            otherDeptView.items.every(c => c.departmentId === 'dept-purchasing'),
            'sees ONLY dept-purchasing counterparties',
        );
        check(
            otherDeptView.items.some(c => c.erpId === 'cnt-dept-purchasing-verify'),
            'specifically sees the dept-purchasing counterparty',
        );

        console.log(
            '\nScenario: department-head in dept-sales but a DIFFERENT branchId than olga...',
        );
        const sameDeptDiffBranchCookie = await loginAs(VERIFY_SAME_DEPT_DIFFERENT_BRANCH_EMAIL);
        const sameDeptDiffBranchView = await listCounterparties(sameDeptDiffBranchCookie);
        check(
            sameDeptDiffBranchView.totalItems === olgaView.totalItems &&
                new Set(sameDeptDiffBranchView.items.map(c => c.erpId)).size ===
                    new Set(olgaView.items.map(c => c.erpId)).size &&
                olgaView.items.every(oc =>
                    sameDeptDiffBranchView.items.some(c => c.erpId === oc.erpId),
                ),
            'sees the EXACT SAME dept-sales counterparties as olga, despite a different branchId — branchId does not narrow Counterparty visibility',
        );

        console.log("\nScenario: general-director (scope 'all')...");
        const nikolaiCookie = await loginAs('nikolai.director@mivend.dev');
        const allView = await listCounterparties(nikolaiCookie);
        check(
            allView.items.some(c => c.departmentId === 'dept-sales') &&
                allView.items.some(c => c.departmentId === 'dept-purchasing'),
            'sees counterparties from BOTH departments regardless of scope',
        );
    } finally {
        console.log('\nCleaning up...');
        await deleteVerifyAdminIfExists(superadminCookie, VERIFY_OTHER_DEPT_EMAIL);
        await deleteVerifyAdminIfExists(superadminCookie, VERIFY_SAME_DEPT_DIFFERENT_BRANCH_EMAIL);
    }

    console.log(`\n${failures === 0 ? '✓ All checks passed' : `✗ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
