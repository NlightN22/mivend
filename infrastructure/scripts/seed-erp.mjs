// Seed script via ERP import REST API. Run: node infrastructure/scripts/seed-erp.mjs
// Requires the server running on localhost:3000 and ERP_IMPORT_TOKEN env variable.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const TOKEN = process.env.ERP_IMPORT_TOKEN ?? 'dev-token';

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

    const customers = [
        { email: 'ivan@autoservice-nord.example', firstName: 'Ivan', lastName: 'Petrov', password: 'Password123!' },
        { email: 'sergey@parts-retail.example', firstName: 'Sergey', lastName: 'Volkov', password: 'Password123!' },
        { email: 'anna@garazh24.example', firstName: 'Anna', lastName: 'Sorokina', password: 'Password123!' },
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

    console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
