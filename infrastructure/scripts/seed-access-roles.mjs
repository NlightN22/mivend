// Seeds the manager-portal Administrator roles with their AccessScopeService scope config.
// Run: node infrastructure/scripts/seed-access-roles.mjs
// Requires the server running on localhost:3000.
//
// Roles are Vendure system configuration (RBAC), not ERP business data, so this goes through
// the Admin GraphQL API directly rather than plugin-erp-import — see AGENTS.md "Dev seed rules"
// exception clause for data that structurally cannot be expressed as an import record.
//
// Role -> max-scope-per-resource matches the persona matrix in
// docs/ai/manager-portal-concept.md §2/§3.3 (Оператор/Менеджер/Руководитель отдела/
// Ген. директор/СБ/Администратор портала). Only the "counterparty" resource is wired up by
// AccessScopeService so far, and only ReadCounterparty/ManageAccessControl exist as custom
// permissions — the approval-workflow permissions from the concept doc (AdjustPriceWithinLimit,
// ApproveDiscountRequest, ManageApprovalWorkflows, ...) aren't registered yet and are
// deliberately left out of the `permissions` lists below until that plugin exists.

const API_URL = `http://localhost:${process.env.PORT ?? '3000'}/admin-api`;

async function gql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken };
}

async function login() {
    const { data, authToken } = await gql(
        `mutation { login(username:"superadmin",password:"superadmin") { ...on CurrentUser{id identifier} ...on ErrorResult{message} } }`,
    );
    if (!authToken) throw new Error('Login failed: ' + JSON.stringify(data));
    console.log('✔ Logged in as', data.login.identifier);
    return authToken;
}

const ROLES = [
    {
        code: 'operator',
        description: 'Operator — processes current orders, all customers in own department/branch',
        permissions: ['ReadCatalog', 'ReadOrder', 'ReadCustomer', 'ReadCounterparty'],
        accessScopeConfig: { counterparty: 'department' },
    },
    {
        code: 'manager',
        description: 'Manager — owns an assigned customer book, must request approval for adjustments',
        permissions: ['ReadCatalog', 'ReadOrder', 'ReadCustomer', 'ReadCounterparty'],
        accessScopeConfig: { counterparty: 'own' },
    },
    {
        code: 'department-head',
        description: 'Department head — approves requests for their department, sees department-wide data',
        permissions: ['ReadCatalog', 'ReadOrder', 'ReadCustomer', 'ReadCounterparty'],
        accessScopeConfig: { counterparty: 'department' },
    },
    {
        code: 'general-director',
        description: 'General director — final approval step, full company-wide visibility',
        permissions: ['ReadCatalog', 'ReadOrder', 'ReadCustomer', 'ReadCounterparty'],
        accessScopeConfig: { counterparty: 'all' },
    },
    {
        code: 'security-officer',
        description: 'Security officer — company-wide read visibility for credit-limit escalations',
        permissions: ['ReadCatalog', 'ReadOrder', 'ReadCustomer', 'ReadCounterparty'],
        accessScopeConfig: { counterparty: 'all' },
    },
    {
        code: 'portal-admin',
        description: 'Portal administrator — manages roles, permissions and (later) approval workflows',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadCustomer',
            'ReadCounterparty',
            'ManageAccessControl',
        ],
        accessScopeConfig: { counterparty: 'all' },
    },
];

async function findRoleByCode(token, code) {
    const { data } = await gql(
        `query FindRole($code: String!) { roles(options:{filter:{code:{eq:$code}}}){ items { id code } } }`,
        { code },
        token,
    );
    return data.roles.items[0] ?? null;
}

async function setAccessScopeConfig(token, roleCode, accessScopeConfig) {
    await gql(
        `mutation SetScope($roleCode: String!, $accessScopeConfig: String!) {
            setRoleAccessScopeConfig(roleCode: $roleCode, accessScopeConfig: $accessScopeConfig)
        }`,
        { roleCode, accessScopeConfig: JSON.stringify(accessScopeConfig) },
        token,
    );
}

async function upsertRole(token, role) {
    const existing = await findRoleByCode(token, role.code);
    const input = {
        code: role.code,
        description: role.description,
        permissions: role.permissions,
        channelIds: ['1'],
    };
    if (existing) {
        await gql(
            `mutation UpdateRole($input: UpdateRoleInput!) { updateRole(input:$input){ id code } }`,
            { input: { id: existing.id, ...input } },
            token,
        );
        console.log(`✔ Updated role "${role.code}"`);
    } else {
        await gql(
            `mutation CreateRole($input: CreateRoleInput!) { createRole(input:$input){ id code } }`,
            { input },
            token,
        );
        console.log(`✔ Created role "${role.code}"`);
    }
    // Role has no customFields support in Vendure — scope config is stored in a dedicated
    // table via access-control's own mutation, set as a second step, not part of createRole/
    // updateRole's input.
    await setAccessScopeConfig(token, role.code, role.accessScopeConfig);
    console.log(`✔ Set accessScopeConfig for "${role.code}"`);
}

async function main() {
    console.log('\n── Seeding manager-portal access-control roles ──\n');
    const token = await login();
    for (const role of ROLES) {
        await upsertRole(token, role);
    }
    console.log('\n── Access-control roles seeded ──\n');
}

main().catch(err => {
    console.error('✘ Seed failed:', err.message);
    process.exit(1);
});
