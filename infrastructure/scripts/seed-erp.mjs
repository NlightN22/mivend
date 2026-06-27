// Seed script via ERP import REST API. Run: node infrastructure/scripts/seed-erp.mjs
// Requires the server running on localhost:3000 and ERP_IMPORT_TOKEN env variable.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';
const ADMIN_URL = `${BASE_URL}/admin-api`;

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

async function adminGql(authToken, query, variables = {}) {
    const res = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

async function getAdminToken() {
    const res = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `mutation Login($u: String!, $p: String!) {
                login(username: $u, password: $p) {
                    ... on CurrentUser { id }
                    ... on ErrorResult { errorCode message }
                }
            }`,
            variables: { u: 'superadmin', p: 'superadmin' },
        }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const tokenMatch = setCookie.match(/vendure-auth-token=([^;]+)/);
    if (tokenMatch) return tokenMatch[1];
    const json = await res.json();
    const authHeader = res.headers.get('vendure-auth-token');
    if (authHeader) return authHeader;
    throw new Error(`Admin login failed: ${JSON.stringify(json)}`);
}

async function seedCustomers(authToken) {
    const customers = [
        { firstName: 'Ivan', lastName: 'Petrov', emailAddress: 'ivan@autoservice-nord.example' },
        { firstName: 'Sergey', lastName: 'Volkov', emailAddress: 'sergey@parts-retail.example' },
        { firstName: 'Anna', lastName: 'Sorokina', emailAddress: 'anna@garazh24.example' },
    ];
    const password = 'Password123!';

    let created = 0;
    let skipped = 0;

    for (const c of customers) {
        const existing = await adminGql(authToken, `
            query($email: String!) {
                customers(options: { filter: { emailAddress: { eq: $email } } }) {
                    totalItems
                }
            }`, { email: c.emailAddress });

        if (existing.customers.totalItems > 0) {
            skipped++;
            continue;
        }

        await adminGql(authToken, `
            mutation($input: CreateCustomerInput!, $password: String) {
                createCustomer(input: $input, password: $password) {
                    ... on Customer { id }
                    ... on ErrorResult { errorCode message }
                }
            }`, { input: c, password });
        created++;
    }

    return { created, skipped };
}

async function main() {
    const products = loadFixture('products');
    const prices = loadFixture('prices');
    const stock = loadFixture('stock');
    const run = Date.now();

    console.log(`Sending ${products.length} products...`);
    const productResult = await postBatch(`seed-products-${run}`, products.map(data => ({ type: 'product', data })));
    console.log(`  → status=${productResult.status} processed=${productResult.processed} failed=${productResult.failed}`);
    if (productResult.errors?.length > 0) {
        for (const e of productResult.errors) console.warn(`    [${e.index}] ${e.message}`);
    }

    console.log(`Sending ${prices.length} prices...`);
    const priceResult = await postBatch(`seed-prices-${run}`, prices.map(data => ({ type: 'price', data })));
    console.log(`  → status=${priceResult.status} processed=${priceResult.processed} failed=${priceResult.failed}`);

    console.log(`Sending ${stock.length} stock records...`);
    const stockResult = await postBatch(`seed-stock-${run}`, stock.map(data => ({ type: 'stock', data })));
    console.log(`  → status=${stockResult.status} processed=${stockResult.processed} failed=${stockResult.failed}`);

    console.log('Seeding customers...');
    const authToken = await getAdminToken();
    const customerResult = await seedCustomers(authToken);
    console.log(`  → created=${customerResult.created} skipped=${customerResult.skipped}`);

    console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
