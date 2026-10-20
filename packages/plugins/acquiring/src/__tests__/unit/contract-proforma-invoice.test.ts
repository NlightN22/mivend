import { describe, expect, it } from 'vitest';

import { assertContractProformaInput, contractProformaLine } from '../../contract-proforma-invoice';

const input = {
    contractId: '1',
    mode: 'advance' as const,
    amount: 100,
    idempotencyKey: 'abcd-1234',
};

describe('assertContractProformaInput', () => {
    it('accepts a positive amount in either mode with no upper limit', () => {
        expect(() => assertContractProformaInput(input)).not.toThrow();
        expect(() =>
            assertContractProformaInput({
                ...input,
                mode: 'debt-repayment',
                amount: 2_000_000_000,
            }),
        ).not.toThrow();
    });

    it.each([0, -5, 1.5, Number.NaN])('rejects amount %s', amount => {
        expect(() => assertContractProformaInput({ ...input, amount })).toThrow();
    });

    it('rejects an unknown mode and a malformed idempotency key', () => {
        expect(() => assertContractProformaInput({ ...input, mode: 'refund' as never })).toThrow();
        expect(() => assertContractProformaInput({ ...input, idempotencyKey: 'x' })).toThrow();
    });
});

describe('contractProformaLine', () => {
    it('prints one line per mode with the contract name and the full amount', () => {
        expect(contractProformaLine('debt-repayment', 'K-1', 500)).toMatchObject({
            name: 'Погашение задолженности по договору K-1',
            quantity: 1,
            linePriceWithTax: 500,
        });
        expect(contractProformaLine('advance', 'K-1', 500).name).toBe('Аванс по договору K-1');
    });
});
