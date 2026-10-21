import { describe, expect, it } from 'vitest';

import {
    assertContractProformaInput,
    contractProformaLine,
    MAX_CONTRACT_PROFORMA_AMOUNT,
} from '../../contract-proforma-invoice';

const input = {
    contractId: '1',
    mode: 'advance' as const,
    amount: 100,
    idempotencyKey: 'abcd-1234',
};

describe('assertContractProformaInput', () => {
    it('accepts a positive amount in either mode up to the Int limit', () => {
        expect(() => assertContractProformaInput(input)).not.toThrow();
        expect(() =>
            assertContractProformaInput({
                ...input,
                mode: 'debt-repayment',
                amount: MAX_CONTRACT_PROFORMA_AMOUNT,
            }),
        ).not.toThrow();
    });

    it.each([0, -5, 1.5, Number.NaN])('rejects amount %s', amount => {
        expect(() => assertContractProformaInput({ ...input, amount })).toThrow();
    });

    it('rejects an amount above the Int limit with a clear message', () => {
        expect(() =>
            assertContractProformaInput({ ...input, amount: MAX_CONTRACT_PROFORMA_AMOUNT + 1 }),
        ).toThrow('Amount must not exceed 2147483647 minor units');
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
