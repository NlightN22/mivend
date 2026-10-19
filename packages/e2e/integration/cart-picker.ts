import type { Page } from '@playwright/test';
import { adminGql } from '../helpers/api';
import { adminTokenFor } from '../helpers/api-tokens';
import { gql, orderStep } from '../storefront/orders/helpers';
import { literal, select } from './contour-db';
import { loadContourEnv } from './contour-env';

export interface CartLine {
    variantId: string;
    quantity: number;
    organizationId: string;
    collectionId: string | null;
    unitName: string | null;
}

export interface PickedCart {
    lines: CartLine[];
    noStockVariantId: string | null;
    skipped: string[];
}

interface VariantInfo {
    id: string;
    organizationId: string | null;
    unitName: string | null;
    collectionId: string | null;
}

const MAX_LINES = 4;
const MAX_STOCK_LOOKUPS = 80;

async function searchVariantIds(page: Page, inStock: boolean): Promise<string[]> {
    const data = (await gql(
        page,
        `query { search(input: { take: 300, inStock: ${inStock}, groupByProduct: false }) { items { productVariantId } } }`,
    )) as { search: { items: { productVariantId: string }[] } };
    return data.search.items.map(i => i.productVariantId);
}

function variantInfo(ids: string[]): Map<string, VariantInfo> {
    const rows =
        select<VariantInfo>(`SELECT pv.id::text, pv."customFieldsOrganizationid"::text AS "organizationId",
        pv."customFieldsUnitname" AS "unitName",
        (SELECT min(c."collectionId")::text FROM collection_product_variants_product_variant c
            WHERE c."productVariantId" = pv.id) AS "collectionId"
        FROM product_variant pv WHERE pv."deletedAt" IS NULL AND pv.enabled
        AND pv.id IN (${ids.map(literal).join(',')})`);
    return new Map(rows.map(r => [r.id, r]));
}

// availableStock reads an order's branch; the customer's latest placed order stands in for the cart.
function branchReferenceOrderId(customerEmail: string): string | null {
    const rows = select<{
        id: string;
    }>(`SELECT o.id::text FROM "order" o JOIN customer c ON c.id = o."customerId"
        WHERE c."emailAddress" = '${customerEmail.replace(/'/g, "''")}' AND o."customFieldsBranchid" IS NOT NULL
        ORDER BY o.id DESC LIMIT 1`);
    return rows[0]?.id ?? null;
}

async function freeStock(variantId: string, orderId: string | null): Promise<number> {
    const { superadmin } = loadContourEnv();
    const token = await adminTokenFor(superadmin.username, superadmin.password);
    const { data } = await adminGql<{ availableStock: number }>(
        `query($v: ID!, $o: ID) { availableStock(productVariantId: $v, orderId: $o) }`,
        { v: variantId, o: orderId },
        token,
    );
    return data.availableStock;
}

function addsVariety(line: VariantInfo, picked: CartLine[]): boolean {
    if (picked.length === 0) return true;
    return (
        !picked.some(p => p.organizationId === line.organizationId) ||
        !picked.some(p => p.collectionId === line.collectionId) ||
        !picked.some(p => p.unitName === line.unitName)
    );
}

// The in-stock search hides exactly these variants, so they come from an unfiltered search.
async function findNoStockVariant(
    page: Page,
    inStockIds: string[],
    refOrderId: string | null,
): Promise<string | null> {
    const seen = new Set(inStockIds);
    const candidates = (await searchVariantIds(page, false)).filter(id => !seen.has(id));
    const info = variantInfo(candidates.length > 0 ? candidates : ['0']);
    let lookups = 0;
    for (const id of candidates) {
        if (!info.get(id)?.organizationId) continue;
        if (++lookups > MAX_STOCK_LOOKUPS) return null;
        if ((await freeStock(id, refOrderId)) <= 0) return id;
    }
    return null;
}

export async function pickMixedCart(page: Page): Promise<PickedCart> {
    const ids = await searchVariantIds(page, true);
    if (ids.length === 0)
        throw new Error('The contour catalog search returned no in-stock variants');
    const info = variantInfo(ids);
    const refOrderId = branchReferenceOrderId(loadContourEnv().customer.email);
    const lines: CartLine[] = [];
    let noStockVariantId: string | null = null;
    let lookups = 0;
    for (const id of ids) {
        const v = info.get(id);
        if (!v?.organizationId || lookups >= MAX_STOCK_LOOKUPS) continue;
        if (lines.length >= MAX_LINES && noStockVariantId) break;
        const wanted = lines.length < MAX_LINES && addsVariety(v, lines);
        if (!wanted && noStockVariantId) continue;
        lookups++;
        const free = await freeStock(id, refOrderId);
        if (free <= 0) {
            noStockVariantId ??= id;
            continue;
        }
        if (!wanted) continue;
        const step = await orderStep(page, id);
        if (step > free) continue;
        lines.push({
            variantId: id,
            quantity: step,
            organizationId: v.organizationId,
            collectionId: v.collectionId,
            unitName: v.unitName,
        });
    }
    if (!noStockVariantId) noStockVariantId = await findNoStockVariant(page, ids, refOrderId);
    if (lines.length === 0)
        throw new Error('No in-stock variant with an organization found for the test customer');
    const skipped: string[] = [];
    const distinct = (key: keyof CartLine): number => new Set(lines.map(l => l[key])).size;
    if (distinct('organizationId') < 2)
        skipped.push('only one organization has free stock among the searched variants');
    if (distinct('collectionId') < 2)
        skipped.push('only one category has free stock among the searched variants');
    if (distinct('unitName') < 2)
        skipped.push('only one sales unit has free stock among the searched variants');
    if (!noStockVariantId) skipped.push('no searched variant without free stock in the branch');
    return { lines, noStockVariantId, skipped };
}
