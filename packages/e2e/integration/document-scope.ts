import { select } from './contour-db';
import { loadContourEnv } from './contour-env';

export interface SampleDocument {
    id: string;
    number: string;
    counterpartyId: string;
    orderId: string | null;
    assetId: string;
    source: string;
}

// The newest ready document with a PDF per counterparty that has any.
export function sampleDocuments(): SampleDocument[] {
    return select<SampleDocument>(`SELECT DISTINCT ON (d."counterpartyId") d.id::text AS id, d.number,
            d."counterpartyId" AS "counterpartyId", d."orderId" AS "orderId", a.id::text AS "assetId", a.source
        FROM document d JOIN asset a ON a.id::text = d."assetId"::text
        WHERE d.status = 'ready' ORDER BY d."counterpartyId", d.id DESC`);
}

export function documentCount(counterpartyIds: string[]): number {
    if (counterpartyIds.length === 0) return 0;
    const list = counterpartyIds.map(id => `'${id}'`).join(',');
    return select<{ n: number }>(`SELECT count(*)::int AS n FROM document
        WHERE "counterpartyId" IN (${list})`)[0].n;
}

export function customerCounterparty(email: string): string {
    return select<{ id: string }>(
        `SELECT "customFieldsCounterpartyid" AS id FROM customer WHERE "emailAddress" = '${email.replace(/'/g, "''")}'`,
    )[0].id;
}

export interface SettlementSample {
    entryId: string;
    number: string;
    contractId: string;
}

// The rows settlementDocuments shows a customer (settlement-shop.service.ts), so the expectation is the backend's.
const SHOWN = `FROM settlement_document_entry e
    JOIN settlement_document d ON d.id = e."documentId" AND NOT d."isDeleted"
    JOIN settlement_document_type t ON t."documentType" = d."documentType" AND NOT t."isDeleted"
    JOIN contract c ON c.id::text = e."contractId" AND c."isCustomerContract" IS TRUE
    WHERE t."customerVisible"`;

export function settlementEntryIds(counterpartyId: string): string[] {
    return select<{ id: string }>(
        `SELECT e.id::text AS id ${SHOWN} AND e."counterpartyId" = '${counterpartyId}' ORDER BY e.id`,
    ).map(r => r.id);
}

export function settlementSample(counterpartyId: string): SettlementSample | undefined {
    return select<SettlementSample>(`SELECT e.id::text AS "entryId", d.number, e."contractId" AS "contractId"
        ${SHOWN} AND e."counterpartyId" = '${counterpartyId}' ORDER BY e.id DESC LIMIT 1`)[0];
}

export function balanceContracts(counterpartyId: string): string[] {
    return select<{ id: string }>(`SELECT DISTINCT b."contractId" AS id FROM settlement_balance b
        JOIN contract c ON c.id::text = b."contractId" AND c."isCustomerContract" IS TRUE
        WHERE b."counterpartyId" = '${counterpartyId}' AND NOT b."isDeleted"`).map(r => r.id);
}

export async function shop<T>(
    query: string,
    variables?: Record<string, unknown>,
    cookie?: string,
): Promise<{ data: T | null; errors: string[] }> {
    const res = await fetch(`${loadContourEnv().serverUrl}/shop-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data: T | null; errors?: { message: string }[] };
    return { data: json.data, errors: (json.errors ?? []).map(e => e.message) };
}

// The PDF link the portals render: the asset server path of the document's file.
export async function downloadStatus(
    source: string,
    auth?: { cookie?: string; token?: string },
): Promise<number> {
    const headers: Record<string, string> = {};
    if (auth?.cookie) headers.Cookie = auth.cookie;
    if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch(`${loadContourEnv().serverUrl}/assets/${source}`, { headers });
    await res.arrayBuffer();
    return res.status;
}
