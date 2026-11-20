import { describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, shop, staffToken } from '../harness/actors';

const DOCUMENT = `query($k: String!) { legalDocument(kind: $k) { kind version body } }`;
const OFFER = `query { legalConsentOffer { kind version required } }`;
const STATUS = `query { legalDocumentStatus { kind version required accepted pending } }`;
const HISTORY = `query { legalAcceptanceHistory { totalItems items { kind version accepted } } }`;
const ACCEPT = `mutation($input: [LegalAcceptanceInput!]!) {
    acceptLegalDocuments(input: $input) { kind accepted pending } }`;

interface Status {
    kind: string;
    version: number;
    required: boolean;
    accepted: boolean;
    pending: boolean;
}

describe('legal documents', () => {
    it('anonymous: reads a published document, nothing else', async () => {
        const doc = await shop<{ legalDocument: { body: string } }>('', DOCUMENT, { k: 'policy' });
        expect(doc.errors).toEqual([]);
        expect(doc.data!.legalDocument.body).toContain('Access Operator');
        const offer = await shop<{ legalConsentOffer: { kind: string; required: boolean }[] }>(
            '',
            OFFER,
        );
        expect(offer.errors).toEqual([]);
        expect(offer.data!.legalConsentOffer.map(o => o.kind).sort()).toEqual([
            'agreement',
            'marketing-consent',
            'personal-data-consent',
        ]);
        expect(
            offer.data!.legalConsentOffer.find(o => o.kind === 'marketing-consent')!.required,
        ).toBe(false);
        for (const query of [STATUS, HISTORY]) {
            expect((await shop('', query)).errors.join(' ')).toMatch(DENIED);
        }
        const accept = await shop('', ACCEPT, { input: [] });
        expect(accept.errors.join(' ')).toMatch(DENIED);
    });

    it('admin API: none of the legal operations exist', async () => {
        const token = await staffToken('superadmin');
        expect((await admin(token, STATUS)).errors.join(' ')).toMatch(/Cannot query field/);
    });

    it('customer: each caller sees and changes only their own answers', async () => {
        const [a, b] = [await customerToken('customer-a'), await customerToken('customer-b')];
        const first = await shop<{ legalDocumentStatus: Status[] }>(a, STATUS);
        const agreement = first.data!.legalDocumentStatus.find(s => s.kind === 'agreement')!;
        expect(agreement.pending).toBe(true);

        const accepted = await shop(a, ACCEPT, {
            input: [{ kind: 'agreement', version: agreement.version, accepted: true }],
        });
        expect(accepted.errors).toEqual([]);

        const mine = await shop<{ legalDocumentStatus: Status[] }>(a, STATUS);
        const theirs = await shop<{ legalDocumentStatus: Status[] }>(b, STATUS);
        expect(mine.data!.legalDocumentStatus.find(s => s.kind === 'agreement')!.pending).toBe(
            false,
        );
        expect(theirs.data!.legalDocumentStatus.find(s => s.kind === 'agreement')!.pending).toBe(
            true,
        );

        const history = await shop<{ legalAcceptanceHistory: { totalItems: number } }>(b, HISTORY);
        expect(history.data!.legalAcceptanceHistory.totalItems).toBe(0);
    });

    it('customer: cannot accept the policy, a stale version, or decline a required document', async () => {
        const token = await customerToken('customer-b');
        const attempts = [
            { kind: 'policy', version: 1, accepted: true },
            { kind: 'agreement', version: 99, accepted: true },
            { kind: 'agreement', version: 1, accepted: false },
        ];
        for (const attempt of attempts) {
            const result = await shop(token, ACCEPT, { input: [attempt] });
            expect(result.errors.length).toBeGreaterThan(0);
        }
    });
});
