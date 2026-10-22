import { gqlOk } from '../harness/graphql';
import { postBatch, type ImportTarget } from './erp-import-seed';
import { COUNTERPARTIES } from './fixture-plan';
import type { SeedIds } from './seed-ids';

const RENDER_TIMEOUT_MS = 180_000;
const READY = `{ documents(options: { take: 100 }) { items { type pdfUrl } } }`;

// A contract PDF per counterparty, rendered by the harness PDF worker from the real generateContract.
export async function seedDocuments(
    target: ImportTarget,
    superadmin: string,
    counterparties: SeedIds['counterparties'],
): Promise<void> {
    await postBatch(
        target,
        'organizationRequisites',
        [
            {
                erpId: 'access-org',
                legalName: 'Access test seller',
                inn: '000000000010',
                legalAddress: 'Test address 1',
                bankName: 'Access test bank',
                bankBik: '000000001',
                bankAccount: '00000000000000000001',
            },
        ],
        'access-org-bank',
    );
    for (const c of COUNTERPARTIES)
        await gqlOk(
            target.baseUrl,
            'admin-api',
            `mutation($c: ID!) { generateContract(counterpartyId: $c) }`,
            { c: counterparties[c.key] },
            superadmin,
        );
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    for (;;) {
        const list = await gqlOk<{
            documents: { items: { type: string; pdfUrl: string | null }[] };
        }>(target.baseUrl, 'admin-api', READY, undefined, superadmin);
        const ready = list.documents.items.filter(d => d.type === 'contract' && d.pdfUrl).length;
        if (ready === COUNTERPARTIES.length) break;
        if (Date.now() > deadline)
            throw new Error(`Only ${ready} contract PDFs rendered, see .access-test/worker.log`);
        await new Promise(r => setTimeout(r, 1000));
    }
}
