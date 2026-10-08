import { describe, expect, it } from 'vitest';

import { chooseOrderContract } from '../../order-contract-rule';

const contract = (
    erpId: string,
    over: Partial<Parameters<typeof chooseOrderContract>[1]> = {},
) => ({
    erpId,
    counterpartyId: 'cp-1',
    organizationId: 'org-1',
    isActive: true,
    ...over,
});

describe('chooseOrderContract', () => {
    it('keeps the selected contract while it is still valid', () => {
        expect(chooseOrderContract('cp-1', contract('picked'), contract('main'))?.erpId).toBe(
            'picked',
        );
    });

    it('falls back to the main contract when nothing was selected', () => {
        expect(chooseOrderContract('cp-1', null, contract('main'))?.erpId).toBe('main');
    });

    it.each([
        ['inactive', { isActive: false }],
        ['of another counterparty', { counterpartyId: 'cp-2' }],
        ['without an organization', { organizationId: '' }],
    ])('ignores a selected contract that is %s and uses the main one', (_name, over) => {
        expect(chooseOrderContract('cp-1', contract('picked', over), contract('main'))?.erpId).toBe(
            'main',
        );
    });

    it('returns null when neither the selected nor the main contract is usable', () => {
        expect(
            chooseOrderContract('cp-1', contract('picked', { isActive: false }), null),
        ).toBeNull();
        expect(
            chooseOrderContract('cp-1', null, contract('main', { organizationId: '' })),
        ).toBeNull();
    });
});
