import { describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staffToken } from '../harness/actors';

const DOCUMENT = `query($k: String!) { legalDocument(kind: $k) { kind version body } }`;
const OFFER = `query { legalConsentOffer { kind version requiredVersion required } }`;
const STATUS = `query { legalDocumentStatus { kind version required accepted pending } }`;
const HISTORY = `query { legalAcceptanceHistory { totalItems items { kind version accepted } } }`;
const ACCEPT = `mutation($input: [LegalAcceptanceInput!]!) {
    acceptLegalDocuments(input: $input) { kind accepted pending } }`;
const CONFIRM = `mutation($t: String!) { confirmEmailAddress(token: $t) }`;
const RESEND = `mutation($id: ID!) { resendEmailConfirmation(customerId: $id) }`;

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
        const offer = await shop<{
            legalConsentOffer: { kind: string; required: boolean; requiredVersion: number }[];
        }>('', OFFER);
        expect(offer.errors).toEqual([]);
        expect(offer.data!.legalConsentOffer.map(o => o.kind).sort()).toEqual([
            'agreement',
            'marketing-consent',
            'personal-data-consent',
        ]);
        expect(
            offer.data!.legalConsentOffer.find(o => o.kind === 'marketing-consent')!.required,
        ).toBe(false);
        expect(offer.data!.legalConsentOffer.every(o => o.requiredVersion === 1)).toBe(true);
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

    it('confirmEmailAddress: a bad or spent token confirms nothing, for anyone', async () => {
        const bad = 'f'.repeat(64);
        const actors = ['', await customerToken('customer-b')];
        for (const token of actors) {
            const result = await shop<{ confirmEmailAddress: boolean }>(token, CONFIRM, { t: bad });
            expect(result.errors).toEqual([]);
            expect(result.data!.confirmEmailAddress).toBe(false);
        }
        const empty = await shop<{ confirmEmailAddress: boolean }>('', CONFIRM, { t: '' });
        expect(empty.data!.confirmEmailAddress).toBe(false);
    });

    it('confirmEmailAddress: does not exist in the admin API, staff included', async () => {
        const token = await staffToken('superadmin');
        const result = await admin(token, CONFIRM, { t: 'f'.repeat(64) });
        expect(result.errors.join(' ')).toMatch(/Cannot query field/);
    });

    it('resendEmailConfirmation: needs ManageCounterpartyPortalAccess within scope, absent from the shop API', async () => {
        const id = seed().customers['customer-a'];
        const denied = await admin(await staffToken('operator-a'), RESEND, { id });
        expect(denied.errors.join(' ')).toMatch(DENIED);
        for (const key of ['manager-a', 'head-a'] as const) {
            const inScope = await admin(await staffToken(key), RESEND, { id });
            expect(inScope.errors.join(' ')).toMatch(/no e-mail address waiting/);
            const foreign = await admin(await staffToken(key), RESEND, {
                id: seed().customers['customer-b'],
            });
            expect(foreign.errors.length).toBeGreaterThan(0);
            expect(foreign.errors.join(' ')).not.toMatch(/no e-mail address waiting/);
        }
        const unknown = await admin(await staffToken('director'), RESEND, { id: '999999' });
        expect(unknown.errors.join(' ')).toMatch(/Customer not found/);
        const director = await staffToken('director');
        const portal = await admin<{ customers: { items: { id: string }[] } }>(
            director,
            `query($e: String!) { customers(options: { filter: { emailAddress: { eq: $e } } }) { items { id } } }`,
            { e: 'customer-team@access.test' },
        );
        const allowed = await admin(director, RESEND, { id: portal.data?.customers.items[0]?.id });
        expect(allowed.errors.join(' ')).not.toMatch(DENIED);
        expect(allowed.errors.join(' ')).toMatch(/no e-mail address waiting/);
        const shopResult = await shop(await customerToken('customer-a'), RESEND, { id });
        expect(shopResult.errors.join(' ')).toMatch(/Cannot query field/);
    });

    it('pending e-mail fields are not on the shop Customer type', async () => {
        const result = await shop(
            await customerToken('customer-a'),
            `query { activeCustomer { emailConfirmationPending emailConfirmationSentAt } }`,
        );
        expect(result.errors.join(' ')).toMatch(/Cannot query field/);
    });
});
