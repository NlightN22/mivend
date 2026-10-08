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

    describe('fallback to another active contract', () => {
        const old = new Date('2020-01-01');
        const recent = new Date('2025-01-01');
        const pick = (candidates: ReturnType<typeof contract>[], priceType?: string) =>
            chooseOrderContract(
                'cp-1',
                null,
                contract('main', { isActive: false }),
                candidates,
                priceType,
            )?.erpId;

        it('keeps the main contract when it is active', () => {
            expect(
                chooseOrderContract('cp-1', null, contract('main'), [contract('other')])?.erpId,
            ).toBe('main');
        });

        it('prefers the contract with the customer price type', () => {
            const candidates = [
                contract('a', { priceTypeId: 'pt-x', createdAt: recent }),
                contract('b', { priceTypeId: 'pt-wanted', createdAt: old }),
            ];
            expect(pick(candidates, 'pt-wanted')).toBe('b');
        });

        it('takes the newest, then the lowest erpId, when the price type does not decide', () => {
            expect(
                pick([
                    contract('a', { createdAt: old }),
                    contract('b', { createdAt: recent }),
                    contract('c', { createdAt: recent }),
                ]),
            ).toBe('b');
        });

        it('is independent of the order of the candidates', () => {
            const a = contract('a', { createdAt: recent });
            const b = contract('b', { createdAt: recent });
            expect(pick([a, b])).toBe(pick([b, a]));
        });

        it('skips inactive, foreign and organization-less candidates and blocks when none is left', () => {
            expect(
                pick([
                    contract('off', { isActive: false }),
                    contract('foreign', { counterpartyId: 'cp-2' }),
                    contract('no-org', { organizationId: '' }),
                ]),
            ).toBeUndefined();
        });

        it('lets a still-valid stored selection win over every fallback', () => {
            expect(
                chooseOrderContract('cp-1', contract('picked'), null, [contract('other')])?.erpId,
            ).toBe('picked');
        });
    });
});
