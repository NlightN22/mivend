import { execFileSync } from 'node:child_process';
import { type Page } from '@playwright/test';
import { gql } from '../orders/helpers';

export const PACK_SKU = 'E2E-FLT-001';
export const PIECE_SKU = 'E2E-OIL-001';
export const PACK_SIZE = 10;
const STORAGE_KEY = 'mv_favorites';

export interface FavoriteTarget {
    variantId: string;
    productId: string;
}

function psql(sql: string): string {
    return execFileSync(
        'docker',
        [
            'exec',
            'docker-postgres-central-1',
            'psql',
            '-U',
            'postgres',
            '-d',
            process.env.E2E_DB_NAME ?? 'mivend_central',
            '-tA',
            '-c',
            sql,
        ],
        { encoding: 'utf8' },
    );
}

// Sales-unit columns are ERP-owned (read-only in the API), so the local fixture sets them in the database.
function setUnit(sku: string, name: string | null, ratio: number | null): void {
    const sql = `UPDATE product_variant SET "customFieldsUnitname" = ${name ? `'${name}'` : 'NULL'}, "customFieldsUnitratiotobase" = ${ratio ?? 'NULL'} WHERE sku = '${sku}'`;
    psql(sql);
}

export interface PackSetup {
    restore: () => void;
}

// The customer's branch comes from the preferred trading point, so every branch follows the mode.
// Makes PACK_SKU a 10-piece pack and switches pack-only sales on or off.
export function setupPackSales(packagesOnly: boolean): PackSetup {
    const original = psql('SELECT "branchId" || \'|\' || "packagesOnly" FROM branch_settings')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(row => row.split('|'));
    const unit = psql(
        `SELECT COALESCE("customFieldsUnitname", '') || '|' || COALESCE("customFieldsUnitratiotobase"::text, '') FROM product_variant WHERE sku = '${PACK_SKU}'`,
    )
        .trim()
        .split('|');
    setUnit(PACK_SKU, 'box', PACK_SIZE);
    psql(`UPDATE branch_settings SET "packagesOnly" = ${packagesOnly}`);
    return {
        restore: () => {
            for (const [branchId, flag] of original) {
                psql(
                    `UPDATE branch_settings SET "packagesOnly" = ${flag === 't'} WHERE "branchId" = '${branchId}'`,
                );
            }
            setUnit(PACK_SKU, unit[0] || null, unit[1] ? Number(unit[1]) : null);
        },
    };
}

export async function favoriteTarget(page: Page, sku: string): Promise<FavoriteTarget> {
    const d = (await gql(
        page,
        `query($t: String) { search(input: { take: 20, term: $t, groupByProduct: false }) { items { productVariantId productId sku } } }`,
        { t: sku },
    )) as { search: { items: { productVariantId: string; productId: string; sku: string }[] } };
    const hit = d.search.items.find(i => i.sku === sku);
    if (!hit) throw new Error(`Variant ${sku} not found in search`);
    return { variantId: hit.productVariantId, productId: hit.productId };
}

// Favorites live in the browser's localStorage, so a test seeds them before the app loads.
export async function seedFavorites(page: Page, targets: FavoriteTarget[]): Promise<void> {
    const items = targets.map((t, i) => ({ ...t, addedAt: i + 1 }));
    await page.addInitScript(
        ([key, value]) => {
            if (!sessionStorage.getItem('fav-seeded')) {
                localStorage.setItem(key, value);
                sessionStorage.setItem('fav-seeded', '1');
            }
        },
        [STORAGE_KEY, JSON.stringify(items)],
    );
}

export async function cartLines(page: Page): Promise<{ sku: string; quantity: number }[]> {
    const d = (await gql(
        page,
        `query { activeOrder { lines { quantity productVariant { sku } } } }`,
    )) as {
        activeOrder: { lines: { quantity: number; productVariant: { sku: string } }[] } | null;
    };
    return (d.activeOrder?.lines ?? []).map(l => ({
        sku: l.productVariant.sku,
        quantity: l.quantity,
    }));
}
