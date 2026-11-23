import { Client } from 'pg';

import { testDbConnection } from '../harness/test-database';
import {
    SALES_DOC_EMPLOYEE_ID,
    SALES_DOC_NUMBERS as N,
    SALES_DOC_ORDER_ERP_ID,
    SALES_DOC_PRODUCT_ERP_ID,
} from './fixture-plan';
import type { OrderSeedIds } from './orders-seed';

interface Doc {
    kind: string;
    erpId: string;
    number: string;
    part: string;
    dealId?: string;
    basis?: string;
    posted?: boolean;
    marked?: boolean;
    deleted?: boolean;
    attributes?: Record<string, unknown>;
}

// The document streams are Kafka-only, so rows are inserted directly; throwaway access DB only.
export async function seedSalesDocuments(
    database: string,
    orders: OrderSeedIds['orders'],
): Promise<void> {
    const client = new Client({ ...testDbConnection(), database });
    await client.connect();
    try {
        await client.query(`UPDATE product SET "customFieldsExternalid" = $1`, [
            SALES_DOC_PRODUCT_ERP_ID,
        ]);
        for (const key of ['a-own', 'b-own'] as const) {
            await client.query(`UPDATE "order" SET "customFieldsErporderid" = $1 WHERE id = $2`, [
                SALES_DOC_ORDER_ERP_ID[key],
                orders[key].id,
            ]);
        }
        const a = SALES_DOC_ORDER_ERP_ID['a-own'];
        const docs: Doc[] = [
            { kind: 'warehouse-order', erpId: 'sd-wo', number: N.picking, part: 'goods', basis: a },
            {
                kind: 'tl-warehouse-work-result',
                erpId: 'sd-wr',
                number: N.picked,
                part: 'warehouseWork',
                basis: 'sd-wo',
                attributes: { employeeId: SALES_DOC_EMPLOYEE_ID },
            },
            {
                kind: 'customer-goods-return',
                erpId: 'sd-r1',
                number: N.returnPosted,
                part: 'goods',
                dealId: a,
            },
            {
                kind: 'customer-goods-return',
                erpId: 'sd-r2',
                number: N.returnUnposted,
                part: 'goods',
                dealId: a,
                posted: false,
            },
            {
                kind: 'customer-goods-return',
                erpId: 'sd-r3',
                number: N.returnMarked,
                part: 'goods',
                dealId: a,
                marked: true,
            },
            {
                kind: 'customer-goods-return',
                erpId: 'sd-r4',
                number: N.returnDeleted,
                part: 'goods',
                dealId: a,
                deleted: true,
            },
            {
                kind: 'customer-goods-return',
                erpId: 'sd-r5',
                number: N.returnUnlinked,
                part: 'goods',
            },
            {
                kind: 'warehouse-order',
                erpId: 'sd-wo-b',
                number: N.foreignPicking,
                part: 'goods',
                basis: SALES_DOC_ORDER_ERP_ID['b-own'],
            },
        ];
        for (const d of docs) await insert(client, d);
    } finally {
        await client.end();
    }
}

async function insert(client: Client, d: Doc): Promise<void> {
    const {
        rows: [{ id }],
    } = await client.query(
        `INSERT INTO erp_sales_document (kind, "erpId", "sourceVersion", number, date, posted, "deletionMarked", "isDeleted", "dealId", "basisDocumentId")
         VALUES ($1, $2, '1', $3, '2026-01-02', $4, $5, $6, $7, $8) RETURNING id`,
        [
            d.kind,
            d.erpId,
            d.number,
            d.posted ?? true,
            d.marked ?? false,
            d.deleted ?? false,
            d.dealId ?? null,
            d.basis ?? null,
        ],
    );
    await client.query(
        `INSERT INTO erp_sales_document_line ("documentId", "lineNumber", part, "productId", quantity, coefficient, attributes)
         VALUES ($1, 1, $2, $3, 1, 1, $4)`,
        [id, d.part, SALES_DOC_PRODUCT_ERP_ID, JSON.stringify(d.attributes ?? {})],
    );
}
