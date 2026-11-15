import { execFileSync } from 'node:child_process';
import type { VisOrder } from '../visibility/ids';
import { clientErpId } from '../visibility/plan';
import { powerOfAttorneySql } from './power-of-attorney';
import {
    ERP_DOCS,
    ERP_DOC_DATE,
    ERP_DOC_KINDS,
    ERP_DOC_ORDER_PREFIX,
    ERP_DOC_TABLES,
    ERP_DOC_UNKNOWN_COUNTERPARTY,
    type ErpDocKind,
    type ErpDocPlan,
    type OrderOwner,
} from './plan';

const ERP_ID_PREFIX = 'e2e-erpdoc-';
const LITERAL = (value: string): string => `'${value.replace(/'/g, "''")}'`;

function runSql(sql: string): void {
    const database = process.env.E2E_DB_NAME;
    if (!database || /staging/.test(database))
        throw new Error('ERP documents are seeded only into the throwaway E2E_DB_NAME database');
    execFileSync(
        'docker',
        [
            'exec',
            '-i',
            'docker-postgres-central-1',
            'psql',
            '-U',
            'postgres',
            '-d',
            database,
            '-v',
            'ON_ERROR_STOP=1',
            '-q',
        ],
        { input: sql, encoding: 'utf8' },
    );
}

const erpOrderId = (owner: OrderOwner): string => `${ERP_DOC_ORDER_PREFIX}${owner}`;

function documentSql(kind: ErpDocKind, doc: ErpDocPlan): string {
    const { header, goods } = ERP_DOC_TABLES[kind];
    const counterparty =
        doc.client === 'unknown' ? ERP_DOC_UNKNOWN_COUNTERPARTY : clientErpId(doc.client);
    const columns = [
        '"erpId"',
        '"sourceVersion"',
        'number',
        'date',
        '"counterpartyId"',
        '"orderId"',
        '"totalAmountMinor"',
        'comment',
        '"isDeleted"',
    ];
    const values = [
        LITERAL(`${ERP_ID_PREFIX}${doc.key}`),
        "'1'",
        LITERAL(doc.number),
        LITERAL(ERP_DOC_DATE),
        LITERAL(counterparty),
        doc.order ? LITERAL(erpOrderId(doc.order)) : 'NULL',
        String(doc.amountMinor),
        LITERAL(doc.comment),
        String(Boolean(doc.deleted)),
    ];
    if (kind !== 'orderCorrection') {
        columns.push('currency');
        values.push("'643'");
    }
    const lines = doc.products
        .map((product, index) => `SELECT id, ${index + 1}, ${LITERAL(product)}, 1 FROM d`)
        .join(' UNION ALL ');
    return `WITH d AS (INSERT INTO ${header} (${columns.join(', ')}) VALUES (${values.join(', ')}) RETURNING id)
INSERT INTO ${goods} ("documentId", "lineNumber", "productId", quantity) ${lines};`;
}

function cleanupSql(): string {
    return ERP_DOC_KINDS.map(kind => {
        const { header, goods } = ERP_DOC_TABLES[kind];
        const own = `SELECT id FROM ${header} WHERE "erpId" LIKE '${ERP_ID_PREFIX}%'`;
        return `DELETE FROM ${goods} WHERE "documentId" IN (${own});\nDELETE FROM ${header} WHERE "erpId" LIKE '${ERP_ID_PREFIX}%';`;
    }).join('\n');
}

// The ERP document streams are Kafka-only (no erp-import path), so the throwaway e2e database gets the rows directly.
export function seedErpDocuments(orders: Record<OrderOwner, VisOrder>): void {
    const orderLinks = (['customer-a', 'customer-b'] as const).map(
        owner =>
            `UPDATE "order" SET "customFieldsErporderid" = ${LITERAL(erpOrderId(owner))} WHERE code = ${LITERAL(orders[owner].code)};`,
    );
    const inserts = ERP_DOC_KINDS.flatMap(kind =>
        ERP_DOCS[kind].map(doc => documentSql(kind, doc)),
    );
    runSql(
        ['BEGIN;', cleanupSql(), ...orderLinks, ...inserts, powerOfAttorneySql(), 'COMMIT;'].join(
            '\n',
        ),
    );
}
