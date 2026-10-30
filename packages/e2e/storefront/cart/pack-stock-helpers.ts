import { execFileSync } from 'node:child_process';

export const PACK_STOCK_SKU = 'E2E-FLT-001';
export const PACK_STOCK_UNIT = 'pack';
export const PACK_STOCK_RATIO = 50;

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
            '-F',
            '|',
            '-c',
            sql,
        ],
        { encoding: 'utf8' },
    );
}

const VARIANT = `(SELECT id FROM product_variant WHERE sku = '${PACK_STOCK_SKU}')`;

function rows(sql: string): string[][] {
    return psql(sql)
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(r => r.split('|'));
}

// Makes the variant a 50-piece pack sold by packs only, with `onHand` pieces in its best location.
// Everything is put back by restore() (stock rows, unit columns, branch flag).
export function setupPackStock(onHand: number): { restore: () => void } {
    const levels = rows(
        `SELECT id, "stockOnHand", COALESCE("customFieldsErpavailablequantity"::text, '') FROM stock_level WHERE "productVariantId" = ${VARIANT} ORDER BY "stockOnHand" DESC, id`,
    );
    const [unit] = rows(
        `SELECT COALESCE("customFieldsUnitname", ''), COALESCE("customFieldsUnitratiotobase"::text, '') FROM product_variant WHERE sku = '${PACK_STOCK_SKU}'`,
    );
    const branches = rows('SELECT "branchId", "packagesOnly" FROM branch_settings');

    psql(
        `UPDATE product_variant SET "customFieldsUnitname" = '${PACK_STOCK_UNIT}', "customFieldsUnitratiotobase" = ${PACK_STOCK_RATIO} WHERE sku = '${PACK_STOCK_SKU}'`,
    );
    psql(`UPDATE branch_settings SET "packagesOnly" = true`);
    psql(
        `UPDATE stock_level SET "stockOnHand" = 0, "stockAllocated" = 0, "customFieldsErpavailablequantity" = NULL WHERE "productVariantId" = ${VARIANT}`,
    );
    psql(`UPDATE stock_level SET "stockOnHand" = ${onHand} WHERE id = ${levels[0][0]}`);

    return {
        restore: () => {
            for (const [id, onHandBefore, cap] of levels) {
                psql(
                    `UPDATE stock_level SET "stockOnHand" = ${onHandBefore}, "customFieldsErpavailablequantity" = ${cap || 'NULL'} WHERE id = ${id}`,
                );
            }
            psql(
                `UPDATE product_variant SET "customFieldsUnitname" = ${unit[0] ? `'${unit[0]}'` : 'NULL'}, "customFieldsUnitratiotobase" = ${unit[1] || 'NULL'} WHERE sku = '${PACK_STOCK_SKU}'`,
            );
            for (const [branchId, flag] of branches) {
                psql(
                    `UPDATE branch_settings SET "packagesOnly" = ${flag === 't'} WHERE "branchId" = '${branchId}'`,
                );
            }
        },
    };
}
