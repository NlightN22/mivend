// Seed script for local development. Run: node infrastructure/scripts/seed.mjs
// Requires the server to be running on localhost:3000

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

    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
        throw new Error(json.errors[0].message);
    }

    return { data: json.data, authToken };
}

async function login() {
    const { data, authToken } = await gql(`
        mutation {
            login(username: "superadmin", password: "superadmin") {
                ... on CurrentUser { id identifier }
                ... on ErrorResult { errorCode message }
            }
        }
    `);
    if (!authToken) throw new Error('Login failed: no token in response');
    console.log('✔ Logged in as', data.login.identifier);
    return authToken;
}

async function isAlreadySeeded(token) {
    const { data } = await gql(
        `query { products(options: { take: 1 }) { totalItems } }`,
        {},
        token,
    );
    return data.products.totalItems > 0;
}

async function createFacet(token, name, code, values) {
    const { data } = await gql(
        `
        mutation CreateFacet($input: CreateFacetInput!) {
            createFacet(input: $input) {
                id name code
                values { id name code }
            }
        }
    `,
        {
            input: {
                isPrivate: false,
                code,
                translations: [{ languageCode: 'en', name }],
                values: values.map(v => ({
                    code: v.code,
                    translations: [{ languageCode: 'en', name: v.name }],
                })),
            },
        },
        token,
    );
    console.log(`✔ Facet "${name}" (${values.length} values)`);
    return data.createFacet;
}

async function createProduct(
    token,
    { name, slug, description, facetValueIds, optionGroup, variants },
) {
    // 1. Create product
    const { data: prodData } = await gql(
        `
        mutation CreateProduct($input: CreateProductInput!) {
            createProduct(input: $input) { id name }
        }
    `,
        {
            input: {
                translations: [{ languageCode: 'en', name, slug, description }],
                facetValueIds,
            },
        },
        token,
    );

    const productId = prodData.createProduct.id;
    let optionIds = {};

    // 2. Create option group and add to product (required for multiple variants)
    if (optionGroup) {
        const { data: groupData } = await gql(
            `
            mutation CreateOptionGroup($input: CreateProductOptionGroupInput!) {
                createProductOptionGroup(input: $input) {
                    id options { id code }
                }
            }
        `,
            {
                input: {
                    code: optionGroup.code,
                    translations: [{ languageCode: 'en', name: optionGroup.name }],
                    options: optionGroup.options.map(o => ({
                        code: o.code,
                        translations: [{ languageCode: 'en', name: o.name }],
                    })),
                },
            },
            token,
        );

        optionIds = Object.fromEntries(
            groupData.createProductOptionGroup.options.map(o => [o.code, o.id]),
        );

        await gql(
            `
            mutation AddOptionGroup($productId: ID!, $optionGroupId: ID!) {
                addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
            }
        `,
            { productId, optionGroupId: groupData.createProductOptionGroup.id },
            token,
        );
    }

    // 3. Create variants
    await gql(
        `
        mutation CreateVariants($input: [CreateProductVariantInput!]!) {
            createProductVariants(input: $input) { id sku }
        }
    `,
        {
            input: variants.map(v => ({
                productId,
                translations: [{ languageCode: 'en', name: v.name }],
                sku: v.sku,
                price: v.price,
                stockOnHand: v.stock ?? 100,
                trackInventory: 'TRUE',
                optionIds: v.optionCode ? [optionIds[v.optionCode]] : [],
            })),
        },
        token,
    );

    console.log(`✔ Product "${name}" (${variants.length} variant(s))`);
    return prodData.createProduct;
}

async function createCustomer(token, firstName, lastName, emailAddress, phone) {
    const { data } = await gql(
        `
        mutation CreateCustomer($input: CreateCustomerInput!, $password: String) {
            createCustomer(input: $input, password: $password) {
                ... on Customer { id firstName lastName }
                ... on ErrorResult { errorCode message }
            }
        }
    `,
        {
            input: { firstName, lastName, emailAddress, phoneNumber: phone },
            password: 'Password123!',
        },
        token,
    );

    if (data.createCustomer.errorCode) {
        console.warn(`⚠ Customer "${firstName} ${lastName}":`, data.createCustomer.message);
        return null;
    }
    console.log(`✔ Customer "${firstName} ${lastName}"`);
    return data.createCustomer;
}

async function setupChannel(token) {
    // Create zone
    const { data: zoneData } = await gql(
        `
        mutation { createZone(input: { name: "Default Zone", memberIds: [] }) { id } }
    `,
        {},
        token,
    );
    const zoneId = zoneData.createZone.id;

    // Create tax category
    const { data: catData } = await gql(
        `
        mutation { createTaxCategory(input: { name: "Standard", isDefault: true }) { id } }
    `,
        {},
        token,
    );

    // Create zero tax rate (prices include tax by default in Vendure)
    await gql(
        `
        mutation CreateTaxRate($input: CreateTaxRateInput!) {
            createTaxRate(input: $input) { id }
        }
    `,
        {
            input: {
                name: 'Standard Tax',
                enabled: true,
                value: 0,
                categoryId: catData.createTaxCategory.id,
                zoneId,
            },
        },
        token,
    );

    // Get default channel and set tax zone
    const { data: channelData } = await gql(`query { channels { items { id } } }`, {}, token);
    const channelId = channelData.channels.items[0].id;

    await gql(
        `
        mutation UpdateChannel($input: UpdateChannelInput!) {
            updateChannel(input: $input) {
                ... on Channel { id }
                ... on ErrorResult { errorCode message }
            }
        }
    `,
        {
            input: { id: channelId, defaultTaxZoneId: zoneId, defaultShippingZoneId: zoneId },
        },
        token,
    );

    console.log('✔ Channel configured (tax zone, shipping zone)');
}

async function main() {
    console.log('\n── Seeding Vendure development database ──\n');

    const token = await login();

    if (await isAlreadySeeded(token)) {
        console.log('Already seeded. To re-seed: drop and recreate the DB.\n');
        return;
    }

    await setupChannel(token);

    // Facets
    const category = await createFacet(token, 'Category', 'category', [
        { name: 'Motor Oils', code: 'motor-oils' },
        { name: 'Spare Parts', code: 'spare-parts' },
        { name: 'Auto Chemicals', code: 'auto-chemicals' },
        { name: 'Accessories', code: 'accessories' },
        { name: 'Batteries', code: 'batteries' },
    ]);

    const brand = await createFacet(token, 'Brand', 'brand', [
        { name: 'Lukoil', code: 'lukoil' },
        { name: 'Motul', code: 'motul' },
        { name: 'NGK', code: 'ngk' },
        { name: 'Bosch', code: 'bosch' },
        { name: 'Sintec', code: 'sintec' },
    ]);

    const cat = Object.fromEntries(category.values.map(v => [v.code, v.id]));
    const br = Object.fromEntries(brand.values.map(v => [v.code, v.id]));

    // Products
    await createProduct(token, {
        name: 'Motor Oil Lukoil Genesis 5W-40',
        slug: 'lukoil-genesis-5w40',
        description: 'Fully synthetic motor oil. API SN/CF.',
        facetValueIds: [cat['motor-oils'], br['lukoil']],
        optionGroup: {
            name: 'Volume',
            code: 'volume-luk-5w40',
            options: [
                { name: '1L', code: '1l' },
                { name: '4L', code: '4l' },
                { name: '5L', code: '5l' },
            ],
        },
        variants: [
            { name: '1L', sku: 'LUK-5W40-1L', price: 89000, stock: 500, optionCode: '1l' },
            { name: '4L', sku: 'LUK-5W40-4L', price: 320000, stock: 300, optionCode: '4l' },
            { name: '5L', sku: 'LUK-5W40-5L', price: 390000, stock: 200, optionCode: '5l' },
        ],
    });

    await createProduct(token, {
        name: 'Motor Oil Motul 8100 X-Clean 5W-30',
        slug: 'motul-8100-xclean-5w30',
        description: '100% synthetic engine oil for low-emission engines.',
        facetValueIds: [cat['motor-oils'], br['motul']],
        optionGroup: {
            name: 'Volume',
            code: 'volume-mot-5w30',
            options: [
                { name: '1L', code: '1l' },
                { name: '4L', code: '4l' },
            ],
        },
        variants: [
            { name: '1L', sku: 'MOT-5W30-1L', price: 125000, stock: 400, optionCode: '1l' },
            { name: '4L', sku: 'MOT-5W30-4L', price: 460000, stock: 150, optionCode: '4l' },
        ],
    });

    await createProduct(token, {
        name: 'Spark Plug NGK BPR6ES',
        slug: 'ngk-bpr6es',
        description: 'Standard spark plug for domestic petrol engines. OEM: 0242235666.',
        facetValueIds: [cat['spare-parts'], br['ngk']],
        variants: [{ name: 'Unit', sku: 'NGK-BPR6ES', price: 15000, stock: 1000 }],
    });

    await createProduct(token, {
        name: 'Coolant Sintec Antifreeze G12 -40',
        slug: 'sintec-antifreeze-g12-40',
        description: 'Red coolant based on ethylene glycol. OEM compatible.',
        facetValueIds: [cat['auto-chemicals'], br['sintec']],
        optionGroup: {
            name: 'Volume',
            code: 'volume-sin-g12',
            options: [
                { name: '1L', code: '1l' },
                { name: '5L', code: '5l' },
                { name: '10L', code: '10l' },
            ],
        },
        variants: [
            { name: '1L', sku: 'SIN-G12-1L', price: 22000, stock: 600, optionCode: '1l' },
            { name: '5L', sku: 'SIN-G12-5L', price: 95000, stock: 300, optionCode: '5l' },
            { name: '10L', sku: 'SIN-G12-10L', price: 175000, stock: 100, optionCode: '10l' },
        ],
    });

    await createProduct(token, {
        name: 'Car Battery Bosch S4 60Ah',
        slug: 'bosch-s4-60ah',
        description: 'Starter battery. 60Ah / 540A CCA.',
        facetValueIds: [cat['batteries'], br['bosch']],
        variants: [{ name: 'Standard', sku: 'BSC-S4-60', price: 890000, stock: 50 }],
    });

    // Customers (B2B)
    await createCustomer(token, 'Ivan', 'Petrov', 'ivan@autoservice-nord.example', '+79131234567');
    await createCustomer(token, 'Sergey', 'Kovalev', 'sergey@parts-retail.example', '+79139876543');
    await createCustomer(token, 'Anna', 'Sorokina', 'anna@garazh24.example', '+79135551122');

    console.log('\n── Seed complete ──\n');
}

main().catch(err => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
});
