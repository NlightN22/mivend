import { describe, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';

const LIST = `query { legalNameAbbreviations { totalItems items { id phrase abbreviation } } }`;
const UPDATE = `mutation($id: ID!, $input: LegalNameAbbreviationInput!) {
    updateLegalNameAbbreviation(id: $id, input: $input) { id phrase abbreviation } }`;

describe('legal name abbreviations (native settings permissions)', () => {
    it('a role without settings permissions can neither read nor change the rules', async () => {
        const token = await staffToken('manager-a');

        const read = await admin(token, LIST);
        const write = await admin(token, UPDATE, {
            id: '1',
            input: { phrase: 'Фонд', abbreviation: 'Ф' },
        });

        expect(read.errors.join(' ')).toMatch(DENIED);
        expect(write.errors.join(' ')).toMatch(DENIED);
    });

    it('the superadmin reads the seeded rules', async () => {
        const token = await staffToken('superadmin');

        const listed = await admin<{ legalNameAbbreviations: { totalItems: number } }>(token, LIST);

        expect(listed.errors).toEqual([]);
        expect(listed.data!.legalNameAbbreviations.totalItems).toBeGreaterThan(0);
    });
});
