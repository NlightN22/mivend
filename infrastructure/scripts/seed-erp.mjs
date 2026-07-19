// Seed script via ERP import REST API. Run: node infrastructure/scripts/seed-erp.mjs
// Requires the server running on localhost:3000 and ERP_IMPORT_TOKEN env variable.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';
const ADMIN_USER = process.env.ADMIN_USER ?? 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'superadmin';

async function adminGraphql(query, variables, authToken) {
    const res = await fetch(`${BASE_URL}/admin-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
}

async function getAdminToken() {
    const data = await adminGraphql(`
        mutation Login($u: String!, $p: String!) {
            login(username: $u, password: $p) {
                ... on CurrentUser { id }
                ... on InvalidCredentialsError { message }
            }
        }
    `, { u: ADMIN_USER, p: ADMIN_PASS });
    if (data.login.message) throw new Error(`Admin login failed: ${data.login.message}`);
    // token is returned via Set-Cookie, re-use session via cookie jar workaround:
    // instead use vendure's token-based auth
    return null; // handled via login mutation which sets cookie
}

// Vendure Admin API uses cookie-based session; we need to capture and forward the session cookie.
async function adminGraphqlWithSession(query, variables, cookie) {
    const res = await fetch(`${BASE_URL}/admin-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    // Vendure sets two cookies: "session=..." and "session.sig=..." — need both
    const rawSetCookie = res.headers.get('set-cookie');
    const sessionCookie = rawSetCookie
        ? rawSetCookie.split(',').map(c => c.split(';')[0].trim()).join('; ')
        : cookie;
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, cookie: sessionCookie ?? cookie };
}

async function ensureTaxSetup() {
    // Login to Admin API
    let session = await adminGraphqlWithSession(`
        mutation { login(username: "${ADMIN_USER}", password: "${ADMIN_PASS}") {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}
    `);
    if (session.data.login.message) throw new Error(`Admin login failed: ${session.data.login.message}`);
    const cookie = session.cookie;

    // Country is Vendure system config, same carve-out as tax zone/shipping/payment methods
    // below — cannot go through erp-import. Checked independently of the tax-zone gate right
    // below (not nested inside it) because a fresh instance can genuinely have zero Country
    // rows even when tax zones were already configured on an earlier run (found live
    // 2026-07-15 on a fresh `make dev-branch` instance: setOrderShippingAddress failed with
    // error.country-code-not-valid). Vendure's own default seed data normally provides these;
    // this project's instances are bootstrapped without it, so they must be seeded explicitly.
    const countriesRes = await adminGraphqlWithSession(`{ countries { items { id code } } }`, undefined, cookie);
    if (countriesRes.data.countries.items.length === 0) {
        await adminGraphqlWithSession(`
            mutation {
                createCountry(input: {
                    code: "RU"
                    enabled: true
                    translations: [{ languageCode: en, name: "Russia" }]
                }) { id }
            }
        `, undefined, cookie);
        console.log('  Created country RU.');
    }

    // Check if default channel already has a tax zone assigned
    const channelCheckRes = await adminGraphqlWithSession(
        `{ channels { items { id defaultTaxZone { id } } } }`,
        undefined, cookie,
    );
    const defaultChannel = channelCheckRes.data.channels.items[0];
    if (defaultChannel?.defaultTaxZone?.id) {
        console.log('  Tax zones already configured, skipping.');
        return;
    }

    // Get or create default tax zone
    const zonesRes = await adminGraphqlWithSession(`{ zones { items { id name } } }`, undefined, cookie);
    let zoneId = zonesRes.data.zones.items[0]?.id;
    if (!zoneId) {
        const zoneRes = await adminGraphqlWithSession(
            `mutation { createZone(input: { name: "Default Tax Zone", memberIds: [] }) { id } }`,
            undefined, cookie,
        );
        zoneId = zoneRes.data.createZone.id;
    }

    // Get or create tax category
    const catRes = await adminGraphqlWithSession(`{ taxCategories { items { id } } }`, undefined, cookie);
    let taxCategoryId = catRes.data.taxCategories.items[0]?.id;
    if (!taxCategoryId) {
        const newCat = await adminGraphqlWithSession(
            `mutation { createTaxCategory(input: { name: "Standard", isDefault: true }) { id } }`,
            undefined, cookie,
        );
        taxCategoryId = newCat.data.createTaxCategory.id;
    }

    // Create 0% tax rate
    await adminGraphqlWithSession(`
        mutation($zoneId: ID!, $catId: ID!) {
            createTaxRate(input: {
                name: "Standard 0%"
                enabled: true
                value: 0
                categoryId: $catId
                zoneId: $zoneId
            }) { id }
        }
    `, { zoneId, catId: taxCategoryId }, cookie);

    // Assign tax zone to the default channel
    const channelRes = await adminGraphqlWithSession(`{ channels { items { id } } }`, undefined, cookie);
    const channelId = channelRes.data.channels.items[0]?.id;
    if (channelId) {
        await adminGraphqlWithSession(`
            mutation($id: ID!, $zoneId: ID!) {
                updateChannel(input: { id: $id, defaultTaxZoneId: $zoneId }) {
                    ... on Channel { id }
                }
            }
        `, { id: channelId, zoneId }, cookie);
    }

    console.log('  Created default tax zone and 0% tax rate.');
}

// ShippingMethod and PaymentMethod are Vendure system config — cannot go through
// erp-import plugin. Without at least one of each, checkout can never transition
// an order out of AddingItems (see docs/ai/PROJECT_CONTEXT.md "Order code strategy"
// section neighbor "Checkout order-state transition" note).
async function ensureShippingAndPaymentSetup() {
    let session = await adminGraphqlWithSession(`
        mutation { login(username: "${ADMIN_USER}", password: "${ADMIN_PASS}") {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}
    `);
    if (session.data.login.message) throw new Error(`Admin login failed: ${session.data.login.message}`);
    const cookie = session.cookie;

    const methodsRes = await adminGraphqlWithSession(
        `{ shippingMethods { items { id code } } }`, undefined, cookie,
    );
    if (methodsRes.data.shippingMethods.items.length === 0) {
        await adminGraphqlWithSession(`
            mutation {
                createShippingMethod(input: {
                    code: "pickup"
                    translations: [{ languageCode: en, name: "Pickup", description: "Pickup per contract terms" }]
                    checker: { code: "default-shipping-eligibility-checker", arguments: [{ name: "orderMinimum", value: "0" }] }
                    calculator: { code: "default-shipping-calculator", arguments: [
                        { name: "rate", value: "0" }
                        { name: "includesTax", value: "auto" }
                        { name: "taxRate", value: "0" }
                    ] }
                    fulfillmentHandler: "manual-fulfillment"
                }) { id }
            }
        `, undefined, cookie);
        console.log('  Created "pickup" shipping method.');
    } else {
        console.log('  Shipping method already configured, skipping.');
    }

    const paymentMethodsRes = await adminGraphqlWithSession(
        `{ paymentMethods { items { id code } } }`, undefined, cookie,
    );
    const existingCodes = new Set(paymentMethodsRes.data.paymentMethods.items.map(m => m.code));
    const paymentMethodsToCreate = [
        { code: 'offline-terms', handler: 'offline-terms', name: 'Invoice / deferred payment' },
        { code: 'online-stub', handler: 'online-stub', name: 'Online payment (demo)' },
    ].filter(m => !existingCodes.has(m.code));
    for (const m of paymentMethodsToCreate) {
        await adminGraphqlWithSession(`
            mutation($code: String!, $handler: String!, $name: String!) {
                createPaymentMethod(input: {
                    code: $code
                    enabled: true
                    handler: { code: $handler, arguments: [] }
                    translations: [{ languageCode: en, name: $name }]
                }) { id }
            }
        `, { code: m.code, handler: m.handler, name: m.name }, cookie);
    }
    if (paymentMethodsToCreate.length > 0) {
        console.log(`  Created ${paymentMethodsToCreate.length} payment method(s).`);
    } else {
        console.log('  Payment methods already configured, skipping.');
    }
}

// Demo administrators for the org-structure import below. Requires the manager-portal roles
// to already exist (`make seed-access-roles`) — if a role is missing, the admin is skipped
// with a warning rather than failing the whole seed run.
async function ensureOrgStructureAdmins() {
    let session = await adminGraphqlWithSession(`
        mutation { login(username: "${ADMIN_USER}", password: "${ADMIN_PASS}") {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}
    `);
    if (session.data.login.message) throw new Error(`Admin login failed: ${session.data.login.message}`);
    const cookie = session.cookie;

    const rolesRes = await adminGraphqlWithSession(
        `{ roles(options: { take: 20 }) { items { id code } } }`, undefined, cookie,
    );
    const roleIdByCode = Object.fromEntries(rolesRes.data.roles.items.map(r => [r.code, r.id]));

    const adminsRes = await adminGraphqlWithSession(
        `{ administrators(options: { take: 50 }) { items { emailAddress } } }`, undefined, cookie,
    );
    const existingEmails = new Set(adminsRes.data.administrators.items.map(a => a.emailAddress));

    const demoAdmins = [
        { email: 'ivan.operator@mivend.dev', firstName: 'Ivan', lastName: 'Operator', roleCode: 'operator' },
        { email: 'petr.manager@mivend.dev', firstName: 'Petr', lastName: 'Manager', roleCode: 'manager' },
        { email: 'olga.depthead@mivend.dev', firstName: 'Olga', lastName: 'DeptHead', roleCode: 'department-head' },
        // Company-wide scope + ReadCounterpartyCredit — the only seeded role that can see every
        // counterparty's credit numbers (department-head/operator/manager cannot, see
        // seed-access-roles.mjs). Needed to exercise credit-visible UI (e.g. manager portal
        // Customers page risk meter) against real data.
        { email: 'nikolai.director@mivend.dev', firstName: 'Nikolai', lastName: 'Director', roleCode: 'general-director' },
        // ManageAccessControl — needed to exercise the manager portal's Settings > Roles &
        // Access page (see seed-access-roles.mjs's portal-admin permissions).
        { email: 'anna.portaladmin@mivend.dev', firstName: 'Anna', lastName: 'PortalAdmin', roleCode: 'portal-admin' },
        // ApproveSecurityLimit — the only seeded role that can decide the first step of an
        // escalated credit-term-extension request (see seed-approvals.mjs / CreditTermGateService).
        { email: 'svetlana.security@mivend.dev', firstName: 'Svetlana', lastName: 'Security', roleCode: 'security-officer' },
    ];

    let created = 0;
    for (const admin of demoAdmins) {
        if (existingEmails.has(admin.email)) continue;
        const roleId = roleIdByCode[admin.roleCode];
        if (!roleId) {
            console.warn(`  Role "${admin.roleCode}" not found — run "make seed-access-roles" first. Skipping ${admin.email}.`);
            continue;
        }
        await adminGraphqlWithSession(`
            mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }
        `, {
            input: {
                firstName: admin.firstName,
                lastName: admin.lastName,
                emailAddress: admin.email,
                password: 'Password123!',
                roleIds: [roleId],
            },
        }, cookie);
        created++;
    }
    if (created > 0) {
        console.log(`  Created ${created} demo org-structure administrator(s).`);
    } else {
        console.log('  Demo org-structure administrators already exist (or roles missing), skipping.');
    }
}

function loadFixture(name) {
    return JSON.parse(readFileSync(join(__dirname, `../fixtures/${name}.json`), 'utf8'));
}

async function postBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

// Resolves erpId -> platform auto-increment id for OrganizationRequisites, so product records
// can carry a real organizationId. No real 1C export for this exists yet (see docs/payments.md
// "Organizations") — organizationRequisites are seeded directly below and looked up here.
async function resolveOrganizationIds() {
    let session = await adminGraphqlWithSession(`
        mutation { login(username: "${ADMIN_USER}", password: "${ADMIN_PASS}") {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}
    `);
    if (session.data.login.message) throw new Error(`Admin login failed: ${session.data.login.message}`);
    const res = await adminGraphqlWithSession(
        `{ organizationRequisites { id erpId legalName } }`,
        undefined, session.cookie,
    );
    const byErpId = {};
    for (const org of res.data.organizationRequisites) {
        byErpId[org.erpId] = Number(org.id);
    }
    return byErpId;
}

// Explicitly turns on the admin-controlled organizationSplitEnabled toggle (default is already
// true, but seeding it explicitly documents intent and survives a future default change) — see
// docs/payments.md "Organizations". Must run before product seeding: ProductHandler rejects any
// product record without organizationId while this is on.
async function ensureOrganizationSplitEnabled() {
    let session = await adminGraphqlWithSession(`
        mutation { login(username: "${ADMIN_USER}", password: "${ADMIN_PASS}") {
            ... on CurrentUser { id }
            ... on InvalidCredentialsError { message }
        }}
    `);
    if (session.data.login.message) throw new Error(`Admin login failed: ${session.data.login.message}`);
    await adminGraphqlWithSession(`
        mutation {
            updateGlobalSettings(input: { customFields: { organizationSplitEnabled: true } }) {
                ... on GlobalSettings { id }
                ... on ErrorResult { message }
            }
        }
    `, undefined, session.cookie);
}

async function main() {
    const categories = loadFixture('categories');
    const products = loadFixture('products');
    const crossReferences = loadFixture('cross-references');
    const prices = loadFixture('prices');
    const stock = loadFixture('stock');
    // Fixed, not Date.now(): exchangeId must stay stable across reruns so erp-import's
    // dedup-by-exchangeId (ImportRunService.findByExchangeId) makes reseeding a no-op
    // instead of piling up a new erp_import_run row every time. Bump to 'v2' etc. only
    // when fixture data actually changes and must be reapplied.
    const run = 'v2';

    // Tax zone is Vendure system config — cannot go through erp-import plugin
    console.log('Ensuring tax zone...');
    await ensureTaxSetup();

    console.log('Ensuring shipping/payment methods...');
    await ensureShippingAndPaymentSetup();

    // Administrator accounts are Vendure system config, same carve-out as tax
    // zones/shipping/payment methods above — cannot go through erp-import.
    console.log('Ensuring demo org-structure administrators...');
    await ensureOrgStructureAdmins();

    console.log('Ensuring organization split is enabled...');
    await ensureOrganizationSplitEnabled();

    console.log(`Sending ${categories.length} categories...`);
    const categoryResult = await postBatch(`seed-categories-${run}`, categories.map(data => ({ type: 'category', data })));
    console.log(`  → status=${categoryResult.status} processed=${categoryResult.processed} failed=${categoryResult.failed}`);
    if (categoryResult.errors?.length > 0) {
        for (const e of categoryResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    // Seeded before products so their platform ids can be assigned to
    // ProductVariant.customFields.organizationId below — no real 1C export for this exists yet
    // (see docs/payments.md "Organizations"; 3 synthetic organizations unblock building/testing
    // the real order-split flow without waiting for it).
    const organizationRequisites = [
        {
            erpId: 'org-001',
            legalName: 'Mivend Demo Trading Co.',
            inn: '000000000000',
            kpp: '000000000',
            ogrn: '0000000000000',
            legalAddress: '1 Demo Avenue, Sample City',
            bankName: 'Demo Bank',
            bankAccount: '00000000000000000000',
            bankBik: '000000000',
            correspondentAccount: '00000000000000000000',
            signatoryName: 'A. Sample',
            signatoryTitle: 'General Director',
        },
        {
            erpId: 'org-002',
            legalName: 'Mivend North Trading Co.',
            inn: '000000000001',
            kpp: '000000001',
            ogrn: '0000000000001',
            legalAddress: '2 Demo Avenue, Sample City',
            bankName: 'Demo Bank',
            bankAccount: '00000000000000000001',
            bankBik: '000000000',
            correspondentAccount: '00000000000000000000',
            signatoryName: 'B. Sample',
            signatoryTitle: 'General Director',
        },
        {
            erpId: 'org-003',
            legalName: 'Mivend South Trading Co.',
            inn: '000000000002',
            kpp: '000000002',
            ogrn: '0000000000002',
            legalAddress: '3 Demo Avenue, Sample City',
            bankName: 'Demo Bank',
            bankAccount: '00000000000000000002',
            bankBik: '000000000',
            correspondentAccount: '00000000000000000000',
            signatoryName: 'C. Sample',
            signatoryTitle: 'General Director',
        },
    ];
    console.log(`Sending ${organizationRequisites.length} organization requisites...`);
    const requisitesResult = await postBatch(`seed-requisites-${run}`, organizationRequisites.map(data => ({ type: 'organizationRequisites', data })));
    console.log(`  → status=${requisitesResult.status} processed=${requisitesResult.processed} failed=${requisitesResult.failed}`);
    if (requisitesResult.errors?.length > 0) {
        for (const e of requisitesResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    console.log('Resolving organization ids...');
    const organizationIdByErpId = await resolveOrganizationIds();
    const organizationErpIds = organizationRequisites.map(org => org.erpId);
    // Round-robin across the 3 seeded organizations so the seeded catalog actually exercises a
    // multi-organization split, instead of every product landing on the same one.
    const productsWithOrganization = products.map((product, index) => ({
        ...product,
        organizationId: organizationIdByErpId[organizationErpIds[index % organizationErpIds.length]],
    }));

    console.log(`Sending ${productsWithOrganization.length} products...`);
    const productResult = await postBatch(`seed-products-${run}`, productsWithOrganization.map(data => ({ type: 'product', data })));
    console.log(`  → status=${productResult.status} processed=${productResult.processed} failed=${productResult.failed}`);
    if (productResult.errors?.length > 0) {
        for (const e of productResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    console.log(`Sending ${crossReferences.length} cross-reference records...`);
    const xrefResult = await postBatch(`seed-xref-${run}`, crossReferences.map(data => ({ type: 'crossReference', data })));
    console.log(`  → status=${xrefResult.status} processed=${xrefResult.processed} failed=${xrefResult.failed}`);
    if (xrefResult.errors?.length > 0) {
        for (const e of xrefResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    console.log(`Sending ${prices.length} prices...`);
    const priceResult = await postBatch(`seed-prices-${run}`, prices.map(data => ({ type: 'price', data })));
    console.log(`  → status=${priceResult.status} processed=${priceResult.processed} failed=${priceResult.failed}`);

    console.log(`Sending ${stock.length} stock records...`);
    const stockResult = await postBatch(`seed-stock-${run}`, stock.map(data => ({ type: 'stock', data })));
    console.log(`  → status=${stockResult.status} processed=${stockResult.processed} failed=${stockResult.failed}`);

    const discountValidFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const discountValidTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const discountRules = [
        {
            erpId: 'discount-lukoil-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'lukoil',
            percent: 10,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        // Volume ladder for the same brand/price type — mutually exclusive with the
        // flat rule above; the highest reached tier wins (see docs/pricing.md).
        {
            erpId: 'discount-lukoil-wholesale-volume-500',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'lukoil',
            percent: 15,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: 500,
        },
        {
            erpId: 'discount-lukoil-wholesale-volume-800',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'lukoil',
            percent: 18,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: 800,
        },
        {
            erpId: 'discount-lukoil-wholesale-volume-1000',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'lukoil',
            percent: 20,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: 1000,
        },
        // Spend-based tier example (mutually exclusive metric from the weight ladder
        // above, same "highest percent wins" rule — see docs/pricing.md).
        {
            erpId: 'discount-castrol-wholesale-spend-20000',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'castrol',
            percent: 15,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minAmount: 20000,
        },
        {
            erpId: 'discount-mann-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'mann',
            percent: 8,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-brembo-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'brembo',
            percent: 12,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-brembo-wholesale-volume-300',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'brembo',
            percent: 16,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: 300,
        },
        {
            erpId: 'discount-ngk-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'ngk',
            percent: 6,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-bosch-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'bosch',
            percent: 10,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-bosch-wholesale-spend-30000',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'bosch',
            percent: 14,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minAmount: 30000,
        },
        {
            erpId: 'discount-febi-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'febi',
            percent: 9,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-sachs-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'sachs',
            percent: 11,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
        {
            erpId: 'discount-philips-wholesale',
            priceTypeCode: 'WHOLESALE',
            facetCode: 'brand',
            facetValueCode: 'philips',
            percent: 7,
            validFrom: discountValidFrom,
            validTo: discountValidTo,
            minWeightKg: null,
        },
    ];
    console.log(`Sending ${discountRules.length} discount rules...`);
    const discountResult = await postBatch(`seed-discount-rules-${run}`, discountRules.map(data => ({ type: 'discountRule', data })));
    console.log(`  → status=${discountResult.status} processed=${discountResult.processed} failed=${discountResult.failed}`);
    if (discountResult.errors?.length > 0) {
        for (const e of discountResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const customers = [
        { email: 'ivan@autoservice-nord.example', firstName: 'Ivan', lastName: 'Petrov', password: 'Password123!' },
        { email: 'sergey@parts-retail.example', firstName: 'Sergey', lastName: 'Volkov', password: 'Password123!' },
        { email: 'anna@garazh24.example', firstName: 'Anna', lastName: 'Sorokina', password: 'Password123!' },
        { email: 'oleg@motorpro.example', firstName: 'Oleg', lastName: 'Kuznetsov', password: 'Password123!' },
        { email: 'marina@fastauto.example', firstName: 'Marina', lastName: 'Belova', password: 'Password123!' },
        { email: 'dmitry@carcenter24.example', firstName: 'Dmitry', lastName: 'Novikov', password: 'Password123!' },
        { email: 'elena@autopoint.example', firstName: 'Elena', lastName: 'Fedorova', password: 'Password123!' },
        { email: 'pavel@tehservice.example', firstName: 'Pavel', lastName: 'Morozov', password: 'Password123!' },
        { email: 'natalia@vostok-parts.example', firstName: 'Natalia', lastName: 'Egorova', password: 'Password123!' },
        { email: 'igor@autobaza.example', firstName: 'Igor', lastName: 'Vasiliev', password: 'Password123!' },
        { email: 'tatiana@remstation.example', firstName: 'Tatiana', lastName: 'Zaitseva', password: 'Password123!' },
        { email: 'andrey@grandmotors.example', firstName: 'Andrey', lastName: 'Sokolov', password: 'Password123!' },
        { email: 'yulia@autoline.example', firstName: 'Yulia', lastName: 'Pavlova', password: 'Password123!' },
        { email: 'roman@centerdetal.example', firstName: 'Roman', lastName: 'Semenov', password: 'Password123!' },
        { email: 'ksenia@autoformat.example', firstName: 'Ksenia', lastName: 'Golubeva', password: 'Password123!' },
        { email: 'viktor@partsmarket.example', firstName: 'Viktor', lastName: 'Orlov', password: 'Password123!' },
        { email: 'svetlana2@autopro-service.example', firstName: 'Svetlana', lastName: 'Nikitina', password: 'Password123!' },
        { email: 'alexey@motorgarant.example', firstName: 'Alexey', lastName: 'Kozlov', password: 'Password123!' },
        { email: 'irina@carpoint24.example', firstName: 'Irina', lastName: 'Lebedeva', password: 'Password123!' },
        { email: 'maxim@techauto.example', firstName: 'Maxim', lastName: 'Grigoriev', password: 'Password123!' },
        { email: 'olga2@servicepark.example', firstName: 'Olga', lastName: 'Stepanova', password: 'Password123!' },
        { email: 'nikita@partsdepot.example', firstName: 'Nikita', lastName: 'Frolov', password: 'Password123!' },
    ];
    console.log(`Sending ${customers.length} customers...`);
    const customerResult = await postBatch(`seed-customers-${run}`, customers.map(data => ({ type: 'customer', data })));
    console.log(`  → status=${customerResult.status} processed=${customerResult.processed} failed=${customerResult.failed}`);
    if (customerResult.errors?.length > 0) {
        for (const e of customerResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const counterparties = [
        {
            erpId: 'cnt-001',
            legalName: 'AutoService Nord LLC',
            shortName: 'AutoService Nord',
            creditLimit: 500000,
            creditBalance: 350000,
            paymentDelayDays: 14,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-002',
            legalName: 'Parts Retail LLC',
            shortName: 'Parts Retail',
            creditLimit: 200000,
            creditBalance: 50000,
            paymentDelayDays: 7,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-003',
            legalName: 'Garazh24 LLC',
            shortName: 'Garazh24',
            creditLimit: 150000,
            creditBalance: 140000,
            paymentDelayDays: 0,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-004',
            legalName: 'MotorPro Service LLC',
            shortName: 'MotorPro',
            creditLimit: 350000,
            creditBalance: 90000,
            paymentDelayDays: 21,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-purchasing',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-005',
            legalName: 'FastAuto Trading LLC',
            shortName: 'FastAuto',
            creditLimit: 100000,
            creditBalance: 95000,
            paymentDelayDays: 7,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-006',
            legalName: 'CarCenter24 LLC',
            shortName: 'CarCenter24',
            creditLimit: 400000,
            creditBalance: 60000,
            paymentDelayDays: 14,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-purchasing',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-007',
            legalName: 'AutoPoint LLC',
            shortName: 'AutoPoint',
            creditLimit: 80000,
            creditBalance: 80000,
            paymentDelayDays: 0,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-008',
            legalName: 'TehService Group LLC',
            shortName: 'TehService',
            creditLimit: 250000,
            creditBalance: 10000,
            paymentDelayDays: 30,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-purchasing',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-009',
            legalName: 'Vostok Parts LLC',
            shortName: 'Vostok Parts',
            creditLimit: 120000,
            creditBalance: 115000,
            paymentDelayDays: 14,
            priceType: 'WHOLESALE',
            isActive: false,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
        {
            erpId: 'cnt-010',
            legalName: 'AutoBaza LLC',
            shortName: 'AutoBaza',
            creditLimit: 300000,
            creditBalance: 45000,
            paymentDelayDays: 21,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            branchId: 'branch-central',
            erpGroupLabel: 'Accounting',
        },
    ];
    console.log(`Sending ${counterparties.length} counterparties...`);
    const counterpartyResult = await postBatch(`seed-counterparties-${run}`, counterparties.map(data => ({ type: 'counterparty', data })));
    console.log(`  → status=${counterpartyResult.status} processed=${counterpartyResult.processed} failed=${counterpartyResult.failed}`);
    if (counterpartyResult.errors?.length > 0) {
        for (const e of counterpartyResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const assignments = [
        { customerEmail: 'ivan@autoservice-nord.example', counterpartyErpId: 'cnt-001' },
        { customerEmail: 'sergey@parts-retail.example', counterpartyErpId: 'cnt-002' },
        { customerEmail: 'anna@garazh24.example', counterpartyErpId: 'cnt-003' },
        { customerEmail: 'oleg@motorpro.example', counterpartyErpId: 'cnt-004' },
        { customerEmail: 'marina@fastauto.example', counterpartyErpId: 'cnt-005' },
        { customerEmail: 'dmitry@carcenter24.example', counterpartyErpId: 'cnt-006' },
        { customerEmail: 'elena@autopoint.example', counterpartyErpId: 'cnt-007' },
        { customerEmail: 'pavel@tehservice.example', counterpartyErpId: 'cnt-008' },
        { customerEmail: 'natalia@vostok-parts.example', counterpartyErpId: 'cnt-009' },
        { customerEmail: 'igor@autobaza.example', counterpartyErpId: 'cnt-010' },
    ];
    console.log(`Sending ${assignments.length} customer-counterparty assignments...`);
    const assignResult = await postBatch(`seed-assignments-${run}`, assignments.map(data => ({ type: 'customerCounterparty', data })));
    console.log(`  → status=${assignResult.status} processed=${assignResult.processed} failed=${assignResult.failed}`);
    if (assignResult.errors?.length > 0) {
        for (const e of assignResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const tradingPoints = [
        { erpId: 'tp-001', counterpartyErpId: 'cnt-001', name: 'Main service point', address: 'Industrial St, 14, building 3', contactName: 'Ivan Petrov', contactPhone: '+7 913 100 0001', workingHours: 'Mon–Fri 08:00–18:00', isActive: true },
        { erpId: 'tp-002', counterpartyErpId: 'cnt-001', name: 'North depot', address: 'Northern Hwy, 52', contactName: 'Alexey Smirnov', contactPhone: '+7 913 200 0002', workingHours: 'Mon–Sat 09:00–17:00', isActive: true },
        { erpId: 'tp-003', counterpartyErpId: 'cnt-001', name: 'Warehouse B', address: 'Warehouse Zone, 8', isActive: true },
    ];
    console.log(`Sending ${tradingPoints.length} trading points...`);
    const tpResult = await postBatch(`seed-trading-points-${run}`, tradingPoints.map(data => ({ type: 'tradingPoint', data })));
    console.log(`  → status=${tpResult.status} processed=${tpResult.processed} failed=${tpResult.failed}`);
    if (tpResult.errors?.length > 0) {
        for (const e of tpResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    // fileUrl is root-relative (not an absolute https://... URL) so it resolves
    // against whatever origin the storefront is actually served from — same
    // reasoning as AssetServerPlugin's assetUrlPrefix (see vendure-config.ts).
    // In production, real ERP-hosted document URLs would replace these; for
    // dev/demo seeding, packages/storefront/public/documents/sample-document.pdf
    // is a real downloadable file, not a dead example.com placeholder.
    const documents = [
        {
            erpId: 'doc-return-001',
            type: 'return',
            counterpartyErpId: 'cnt-001',
            number: 'RET-000123',
            issueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            amount: 471000,
            currencyCode: 'RUB',
            fileUrl: '/documents/sample-document.pdf',
            metadata: { reason: 'Damaged in transit' },
        },
        {
            erpId: 'doc-reconciliation-001',
            type: 'reconciliation',
            counterpartyErpId: 'cnt-001',
            number: 'REC-2026-06',
            issueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            amount: 18858000,
            currencyCode: 'RUB',
            fileUrl: '/documents/sample-document.pdf',
            metadata: { periodStart: '2026-06-01', periodEnd: '2026-06-30' },
        },
    ];
    console.log(`Sending ${documents.length} ERP-pushed documents...`);
    const documentsResult = await postBatch(`seed-documents-${run}`, documents.map(data => ({ type: 'document', data })));
    console.log(`  → status=${documentsResult.status} processed=${documentsResult.processed} failed=${documentsResult.failed}`);
    if (documentsResult.errors?.length > 0) {
        for (const e of documentsResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    // Org structure (departments + department/branch/role assignment onto existing
    // Administrators) — see docs/ai/manager-portal-concept.md §3.2.2. Employee records
    // match by email and never create the Administrator account itself (see
    // ensureOrgStructureAdmins() above and EmployeeService in plugin-access-control).
    const departments = [
        { erpId: 'dept-sales', name: 'Sales department' },
        { erpId: 'dept-purchasing', name: 'Purchasing department' },
    ];
    console.log(`Sending ${departments.length} departments...`);
    const departmentResult = await postBatch(`seed-departments-${run}`, departments.map(data => ({ type: 'department', data })));
    console.log(`  → status=${departmentResult.status} processed=${departmentResult.processed} failed=${departmentResult.failed}`);
    if (departmentResult.errors?.length > 0) {
        for (const e of departmentResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const branches = [{ erpId: 'branch-central', name: 'Central branch' }];
    console.log(`Sending ${branches.length} branches...`);
    const branchResult = await postBatch(`seed-branches-${run}`, branches.map(data => ({ type: 'branch', data })));
    console.log(`  → status=${branchResult.status} processed=${branchResult.processed} failed=${branchResult.failed}`);
    if (branchResult.errors?.length > 0) {
        for (const e of branchResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    const employees = [
        { erpId: 'emp-001', email: 'ivan.operator@mivend.dev', departmentErpId: 'dept-sales', branchId: 'branch-central', roleCode: 'operator', position: 'Sales operator' },
        { erpId: 'emp-002', email: 'petr.manager@mivend.dev', departmentErpId: 'dept-sales', branchId: 'branch-central', roleCode: 'manager', position: 'Sales manager' },
        { erpId: 'emp-003', email: 'olga.depthead@mivend.dev', departmentErpId: 'dept-sales', branchId: 'branch-central', roleCode: 'department-head', position: 'Head of sales' },
        { erpId: 'emp-004', email: 'nikolai.director@mivend.dev', departmentErpId: 'dept-sales', branchId: 'branch-central', roleCode: 'general-director', position: 'General director' },
    ];
    console.log(`Sending ${employees.length} employees...`);
    const employeeResult = await postBatch(`seed-employees-${run}`, employees.map(data => ({ type: 'employee', data })));
    console.log(`  → status=${employeeResult.status} processed=${employeeResult.processed} failed=${employeeResult.failed}`);
    if (employeeResult.errors?.length > 0) {
        for (const e of employeeResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
