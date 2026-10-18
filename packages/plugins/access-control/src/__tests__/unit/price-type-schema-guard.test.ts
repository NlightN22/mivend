import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A new price-bearing GraphQL field must be classified here (and gated by PriceTypeAccessService
// when it can reveal a price type or a value of one); an unlisted field fails this test (#235).
const PLUGINS = join(__dirname, '../../../..');
const FIELD =
    /^\s*([A-Za-z_]*(?:[Pp]rice|[Ff]loor|[Mm]argin|[Mm]arkup|[Pp]rofit)[A-Za-z_]*)\s*(?:\([^)]*\))?\s*:/gm;

const INVENTORY: Record<string, string> = {
    'access-control/src/access-control.plugin.ts::defaultPriceTypeId':
        'branch settings, ReadSettings editor; id only',
    'access-control/src/access-control.plugin.ts::visiblePriceTypeIds':
        'branch settings, ReadSettings editor; ids only',
    'acquiring/src/api/admin.schema.ts::linePriceWithTax':
        'order line amount of the order own type',
    'acquiring/src/api/admin.schema.ts::unitPriceWithTax':
        'order line amount of the order own type',
    'acquiring/src/api/shop.schema.ts::linePriceWithTax': 'storefront: own order line amount',
    'acquiring/src/api/shop.schema.ts::unitPriceWithTax': 'storefront: own order line amount',
    'approval-workflow/src/approval-workflow.plugin.ts::pendingPriceAdjustmentOrderIds':
        'order ids only',
    'approval-workflow/src/approval-workflow.plugin.ts::priceAdjustmentRequestsForOrder':
        'requested price, floor never in payload',
    'counterparty/src/counterparty.schema.ts::priceType':
        'admin: CounterpartyPriceTypeResolver (null without access)',
    'counterparty/src/trading-point.schema.ts::priceType':
        'storefront: the customer own counterparty type',
    'price-entry/src/price-entry.plugin.ts::bulkUpsertPriceEntries':
        'PriceEntryAdminResolver: every code asserted',
    'price-entry/src/price-entry.plugin.ts::compareAtPrice': 'storefront: own price type',
    'price-entry/src/price-entry.plugin.ts::customerPrice': 'storefront: own price type',
    'price-entry/src/price-entry.plugin.ts::decidePriceAdjustmentRequest':
        'mutation, no price type output',
    'price-entry/src/price-entry.plugin.ts::floorPrice': 'ReadConfidentialPriceTypes',
    'price-entry/src/price-entry.plugin.ts::floorPricesForVariants': 'ReadConfidentialPriceTypes',
    'price-entry/src/price-entry.plugin.ts::price':
        'value of an entry the caller was allowed to request',
    'price-entry/src/price-entry.plugin.ts::priceEntriesForVariants': 'assertCodeAllowed',
    'price-entry/src/price-entry.plugin.ts::priceTypeCode':
        'discount rule/registry/entry types, filtered by allowed codes',
    'price-entry/src/price-entry.plugin.ts::priceTypeCodes': 'PriceTypeAccessService.allowedCodes',
    'price-entry/src/price-entry.plugin.ts::requestPriceAdjustment':
        'mutation, decision only, floor never returned',
    'price-entry/src/price-entry.plugin.ts::upsertPriceEntry': 'assertCodeAllowed',
    'retro-bonus/src/retro-bonus.plugin.ts::priceTypeErpId':
        'RetroBonusRulePriceTypeResolver (null without access)',
    'search/src/external-search.schema.ts::priceRangeWithTax':
        'storefront search by the viewer own type; staff via SearchPriceTypeService',
    'search/src/search.plugin.ts::compareAtPrice': 'storefront: own price type',
    'search/src/search.plugin.ts::customerPrice': 'storefront: own price type',
    'search/src/search.plugin.ts::priceRange': 'storefront search by the viewer own type',
};

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') return [];
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function priceFields(): string[] {
    const found = new Set<string>();
    for (const plugin of readdirSync(PLUGINS)) {
        const src = join(PLUGINS, plugin, 'src');
        if (!exists(src)) continue;
        for (const file of walk(src)) {
            const isGraphql = file.endsWith('.graphql');
            if (!isGraphql && !file.endsWith('.ts')) continue;
            const text = readFileSync(file, 'utf8');
            const blocks = isGraphql ? [text] : [...text.matchAll(/gql`([^`]*)`/g)].map(m => m[1]);
            for (const block of blocks) {
                for (const m of block.matchAll(FIELD)) {
                    found.add(`${relative(PLUGINS, file)}::${m[1]}`);
                }
            }
        }
    }
    return [...found].sort();
}

function exists(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

describe('price-bearing GraphQL fields are all classified (#235)', () => {
    it('has no unclassified price field', () => {
        const unlisted = priceFields().filter(f => !(f in INVENTORY));
        expect(unlisted).toEqual([]);
    });

    it('has no stale inventory entry', () => {
        const current = new Set(priceFields());
        expect(Object.keys(INVENTORY).filter(k => !current.has(k))).toEqual([]);
    });
});
