import { expect, inject } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import { COUNTERPARTIES, type CounterpartyKey } from '../seed/fixture-plan';

export const LIST = `query($cp: ID, $search: String) { documents(counterpartyId: $cp,
    options: { take: 100, search: $search }) { totalItems items { id type number pdfUrl } } }`;
export const TYPES = `query($cp: ID) { documentTypes(counterpartyId: $cp) }`;

export interface DocumentPage {
    totalItems: number;
    items: { id: string; type: string; number: string; pdfUrl: string | null }[];
}

export interface SampleDocument {
    counterparty: CounterpartyKey;
    id: string;
    number: string;
    pdfUrl: string;
    total: number;
}

export async function documents(
    token: string,
    vars: Record<string, unknown> = {},
): Promise<DocumentPage> {
    const result = await admin<{ documents: DocumentPage }>(token, LIST, vars);
    expect(result.errors).toEqual([]);
    return result.data!.documents;
}

// The generated contract of every counterparty and its document count, as the superadmin sees them.
export async function samples(): Promise<SampleDocument[]> {
    const superadmin = await staffToken('superadmin');
    const out: SampleDocument[] = [];
    for (const { key } of COUNTERPARTIES) {
        const page = await documents(superadmin, { cp: seed().counterparties[key] });
        const contract = page.items.find(d => d.type === 'contract' && d.pdfUrl);
        expect(contract, `contract PDF of ${key}`).toBeTruthy();
        expect(page.totalItems, `documents of ${key}`).toBeGreaterThanOrEqual(2);
        out.push({
            counterparty: key,
            ...contract!,
            pdfUrl: contract!.pdfUrl!,
            total: page.totalItems,
        });
    }
    return out;
}

export interface Download {
    status: number;
    type: string | null;
    disposition: string | null;
    body: Buffer;
}

export async function download(pdfUrl: string, token?: string): Promise<Download> {
    const res = await fetch(`${inject('accessBaseUrl')}${pdfUrl}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return {
        status: res.status,
        type: res.headers.get('content-type'),
        disposition: res.headers.get('content-disposition'),
        body: Buffer.from(await res.arrayBuffer()),
    };
}
