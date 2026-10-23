// Seeds BULK-* products and times cart mutations on a large cart (#271). Run: node infrastructure/scripts/seed-large-cart.mjs [lines=200]
// Requires the local contour (`make dev` + `make seed`).
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-import-token-change-me-0000';
const LINES = Number(process.argv[2] ?? 200);
const sku = i => `BULK-${String(i).padStart(3, '0')}`;
const brands = ['ladder-only', 'flat-plus-ladder', 'flat-beats-ladder', 'amount-ladder'];

async function postBatch(exchangeId, records) {
    const res = await fetch(`${BASE_URL}/erp/import/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ exchangeId, records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (result.failed > 0) throw new Error(`${exchangeId}: ${JSON.stringify(result.errors.slice(0, 3))}`);
    return result;
}

function client(path) {
    let cookie = '';
    return async (query, variables) => {
        const res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            body: JSON.stringify({ query, variables }),
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(',').map(c => c.split(';')[0].trim()).join('; ');
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        return json.data;
    };
}

async function seed() {
    const ids = Array.from({ length: LINES }, (_, i) => i + 1);
    const products = ids.map(i => ({
        externalId: `ext-bulk-${i}`,
        sku: sku(i),
        name: `Bulk item ${i}`,
        fullName: `Bulk item ${i}`,
        slug: `bulk-item-${i}`,
        description: 'Large-cart measurement fixture',
        price: 1000 + i,
        stockOnHand: 100000,
        categoryCode: 'cat-engine-oils-semi-synthetic',
        brandCode: brands[i % brands.length],
        weight: 5,
        organizationId: Number(process.env.ORGANIZATION_ID ?? 1),
    }));
    const run = `bulk-${LINES}-${Date.now()}`;
    await postBatch(`seed-${run}-products`, products.map(data => ({ type: 'product', data })));
    await postBatch(
        `seed-${run}-prices`,
        products.map(p => ({ type: 'price', data: { sku: p.sku, priceTypeCode: 'WHOLESALE', price: p.price } })),
    );
    await postBatch(
        `seed-${run}-stock`,
        products.map(p => ({ type: 'stock', data: { sku: p.sku, stockOnHand: p.stockOnHand } })),
    );
}

async function variantIds() {
    const admin = client('/admin-api');
    await admin(`mutation { login(username: "superadmin", password: "superadmin") { ... on CurrentUser { id } } }`);
    const data = await admin(
        `query($t: Int!) { productVariants(options: { take: $t, filter: { sku: { contains: "BULK-" } } }) { items { id sku } } }`,
        { t: LINES },
    );
    return data.productVariants.items.map(v => v.id);
}

const time = async (label, fn) => {
    const t = performance.now();
    await fn();
    console.log(`${label}: ${Math.round(performance.now() - t)} ms`);
};

await seed();
const ids = await variantIds();
console.log(`${ids.length} BULK variants`);
const shop = client('/shop-api');
await shop(`mutation { login(username: "ivan@autoservice-nord.example", password: "Password123!") { ... on CurrentUser { id } } }`);
await shop(`mutation { removeAllOrderLines { __typename } }`).catch(() => undefined);
const add = id => shop(`mutation($id: ID!) { addItemToOrder(productVariantId: $id, quantity: 2) { __typename ... on ErrorResult { message } } }`, { id });
const checkpoints = new Set([1, 41, 100, LINES]);
for (let n = 1; n <= ids.length; n++) {
    if (checkpoints.has(n)) await time(`add line #${n}`, () => add(ids[n - 1]));
    else await add(ids[n - 1]);
}
const order = await shop(`query { activeOrder { id lines { id } } }`);
const lineId = order.activeOrder.lines[0].id;
await time(`adjust (${order.activeOrder.lines.length} lines)`, () =>
    shop(`mutation($l: ID!) { adjustOrderLine(orderLineId: $l, quantity: 3) { __typename } }`, { l: lineId }),
);
await time('read activeOrder', () =>
    shop(`query { activeOrder { totalWithTax lines { discountedLinePriceWithTax } } }`),
);
await shop(`mutation { removeAllOrderLines { __typename } }`);
