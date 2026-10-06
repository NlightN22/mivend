import { describe, it, expect } from 'vitest';

import {
    CREDIT_LIMIT_EXCEEDED,
    exceedsCreditLimit,
    formatOverrunMessage,
} from '../../credit-limit-decision';

describe('exceedsCreditLimit', () => {
    const counterparty = { creditLimit: 1000, creditBalance: 400 };

    it('allows an order that lands exactly on the limit (minor units → rubles)', () => {
        expect(exceedsCreditLimit(counterparty, 60000)).toBeNull();
    });

    it('rejects an order that pushes the balance over the limit', () => {
        expect(exceedsCreditLimit(counterparty, 60100)).toEqual({
            creditLimit: 1000,
            creditBalance: 400,
            orderTotal: 601,
        });
    });

    it('coerces bigint columns that arrive as strings', () => {
        const overrun = exceedsCreditLimit(
            { creditLimit: '100' as unknown as number, creditBalance: '90' as unknown as number },
            2000,
        );
        expect(overrun).not.toBeNull();
    });

    it('formats a machine-readable decline message', () => {
        const message = formatOverrunMessage({ creditLimit: 1, creditBalance: 1, orderTotal: 1 });
        expect(message.startsWith(`${CREDIT_LIMIT_EXCEEDED}: `)).toBe(true);
    });
});
