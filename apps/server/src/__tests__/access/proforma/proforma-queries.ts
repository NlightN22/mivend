import { expect } from 'vitest';

import { admin, staffToken } from '../harness/actors';

export const DENIED_OR_MISSING =
    /not currently authorized|No \w+ with the id "\d+" could be found|not found/i;

const BY_NUMBER = `query($s: String!) { visibleProformaInvoices(options: { take: 10, search: $s }) {
    items { number status } } }`;

export async function proformaStatus(number: string): Promise<string> {
    const result = await admin<{
        visibleProformaInvoices: { items: { number: string; status: string }[] };
    }>(await staffToken('superadmin'), BY_NUMBER, { s: number });
    expect(result.errors).toEqual([]);
    const found = result.data!.visibleProformaInvoices.items.find(p => p.number === number);
    if (!found) throw new Error(`Proforma ${number} is missing`);
    return found.status;
}
