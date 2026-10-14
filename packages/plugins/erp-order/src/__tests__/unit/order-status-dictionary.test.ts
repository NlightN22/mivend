import { describe, expect, it } from 'vitest';

import { OrderStatusDictionary } from '../../order-status-dictionary';
import { testOrderStatusDictionary } from '../../testing/order-status-fixture';

const dictionary = testOrderStatusDictionary();

describe('canAdvance', () => {
    it.each([
        ['CONFIRMED', 'PICKING', true],
        [null, 'UNDER_APPROVAL', true],
        ['PICKING', 'SHIPPING', true],
        ['SHIPPING', 'PICKING', false],
        ['SHIPPING', 'SHIPPING', false],
        ['DELIVERED', 'APPROVED', false],
        ['PICKING', 'CONFIRMED', false],
        ['CANCELLED', 'DELIVERED', false],
    ] as const)('%s -> %s is %s', (current, next, expected) => {
        expect(dictionary.canAdvance(current, next)).toBe(expected);
    });

    it('never applies a status the dictionary does not have', () => {
        expect(dictionary.canAdvance('CONFIRMED', 'LEGACY')).toBe(false);
    });

    it('lets an order whose current status is unknown move on', () => {
        expect(dictionary.canAdvance('LEGACY', 'APPROVED')).toBe(true);
    });

    it('treats any status flagged cancelled as terminal, whatever its code', () => {
        const custom = new OrderStatusDictionary(
            dictionary.entries.map(e => (e.code === 'CANCELLED' ? { ...e, code: 'VOID' } : e)),
        );
        expect(custom.canAdvance('VOID', 'DELIVERED')).toBe(false);
    });
});

describe('vendureState', () => {
    it.each([
        ['CANCELLED', 'Cancelled'],
        ['DELIVERED', 'Delivered'],
        ['SHIPPING', 'Shipped'],
        ['DELIVERING', 'Shipped'],
        ['CONFIRMED', 'PaymentAuthorized'],
        ['APPROVED', 'PaymentAuthorized'],
    ] as const)('%s -> %s', (status, state) => {
        expect(dictionary.vendureState(status)).toBe(state);
    });

    it('follows the flags, not the code', () => {
        const custom = new OrderStatusDictionary(
            dictionary.entries.map(e => (e.code === 'PICKING' ? { ...e, shipped: true } : e)),
        );
        expect(custom.vendureState('PICKING')).toBe('Shipped');
    });
});

describe('role lookup', () => {
    it('resolves the pipeline roles to the provisioned codes', () => {
        expect(dictionary.codeWith('initial')).toBe('PENDING');
        expect(dictionary.codeWith('submitted')).toBe('SENT_TO_ERP');
        expect(dictionary.codeWith('rejected')).toBe('REJECTED');
        expect(dictionary.codeWith('cancelled')).toBe('CANCELLED');
        expect(dictionary.codeWith('externalDefault')).toBe('CONFIRMED');
    });

    it('fails loudly when a role has no status', () => {
        expect(() => new OrderStatusDictionary([]).codeWith('initial')).toThrow(/initial/);
    });

    it('lists the codes of a customer group', () => {
        expect(dictionary.codesInGroup('in_transit').sort()).toEqual(['DELIVERING', 'SHIPPING']);
    });
});
