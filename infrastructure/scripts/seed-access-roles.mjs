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
// Ген. директор/СБ/Администратор портала). Only the "counterparty"/"order" resources are wired
// up by AccessScopeService so far (resolveCounterpartyScope/resolveOrderScope) — every role's
// accessScopeConfig must set both keys, or the resource missing a key silently falls back to
// 'own' (see RoleScopeConfigService.maxScopeFor's default) regardless of the role's intended
// visibility. WorkflowDefinition rows for the requestTypes referenced below
// (priceAdjustmentApproval, discountGrantApproval) are separate admin config
// (upsertWorkflowDefinition), not created by this script.

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
        // CreateOrder/UpdateOrder are required for the manager portal's /orders/new draft-order
        // flow (createDraftOrder, addItemToDraftOrder, setDraftOrderShippingAddress, etc.) —
        // Operator is the primary user of that page, see docs/ai/manager-portal-pages/
        // 02b-order-create.md.
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'ReadCustomer',
            'ReadCounterparty',
        ],
        accessScopeConfig: { counterparty: 'department', order: 'department', invoice: 'department' },
    },
    {
        code: 'manager',
        description: 'Manager — owns an assigned customer book, must request approval for adjustments',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'ReadCustomer',
            'ReadCounterparty',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
        ],
        accessScopeConfig: { counterparty: 'own', order: 'own', invoice: 'own' },
    },
    {
        code: 'department-head',
        description: 'Department head — approves requests for their department, sees department-wide data',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadFloorPrice',
            'ApproveDiscountRequest',
            'ReassignCounterpartyManager',
            'ReadEntityHistory',
        ],
        accessScopeConfig: { counterparty: 'department', order: 'department', invoice: 'department' },
    },
    {
        code: 'general-director',
        description: 'General director — final approval step, full company-wide visibility',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ApproveDiscountRequest',
            'ReadEntityHistory',
            // Manages roles/permissions like portal-admin — see that role's comment for why
            // this needs the full operational-permission union, not just ManageAccessControl:
            // Vendure's RoleService hides any Role whose permission set isn't a full subset of
            // the caller's own (privilege-escalation guard), so seeing/editing the other 5
            // roles via Settings > Roles & Access requires holding everything any of them can do.
            'ManageAccessControl',
            'ReadAdministrator',
            'UpdateAdministrator',
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
            'ApproveSecurityLimit',
            'ManageApprovalWorkflows',
            'ReassignCounterpartyManager',
        ],
        accessScopeConfig: { counterparty: 'all', order: 'all', teamVisibility: 'all', invoice: 'all' },
    },
    {
        code: 'security-officer',
        description: 'Security officer — company-wide read visibility for credit-limit escalations',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ApproveSecurityLimit',
            'ReadEntityHistory',
        ],
        accessScopeConfig: { counterparty: 'all', order: 'all', teamVisibility: 'all', invoice: 'all' },
    },
    {
        code: 'portal-admin',
        description: 'Portal administrator — manages roles, permissions and (later) approval workflows',
        permissions: [
            'ReadCatalog',
            'ReadOrder',
            'ReadInvoice',
            'ReadPayment',
            'ReadCustomer',
            'ReadCounterparty',
            'ReadCounterpartyCredit',
            'ReadFloorPrice',
            'ManageAccessControl',
            'ManageApprovalWorkflows',
            'ReassignCounterpartyManager',
            'ReadEntityHistory',
            // Native Vendure permissions gating the roles/role/updateRole operations
            // (see @vendure/core's RoleResolver) — required for the manager portal's
            // Settings > Roles & Access page to read/write other roles' permissions.
            'ReadAdministrator',
            'UpdateAdministrator',
            // Vendure's RoleService.activeUserCanReadRole hides a Role entirely from anyone who
            // doesn't themselves hold every permission that role grants (privilege-escalation
            // guard, not configurable) — so managing the other 5 roles from the Settings page
            // requires portal-admin to hold the full union of everything any of them can do,
            // not just its own operational permissions. Without this, `roles`/`role` silently
            // returns nothing for operator/manager/department-head/general-director/
            // security-officer even though ManageAccessControl + ReadAdministrator are granted.
            'CreateOrder',
            'UpdateOrder',
            'ConfirmOrder',
            'AdjustPriceWithinLimit',
            'RequestPriceAdjustmentApproval',
            'RequestDiscountGrantApproval',
            'RequestCreditTermApproval',
            'ApproveDiscountRequest',
            'ApproveSecurityLimit',
        ],
        accessScopeConfig: { counterparty: 'all', order: 'all', teamVisibility: 'all', invoice: 'all' },
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
