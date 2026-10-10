import { describe, it, expect } from 'vitest';

import { deriveOrderErpStatus } from '../../order-erp-status.derivation';

describe('deriveOrderErpStatus', () => {
    it.each([
        [{ markedForDeletion: true, delivered: true, status: 'Согласован' }, 'CANCELLED'],
        [{ delivered: true, inDelivery: true, hasRealization: true, hasOrder: true }, 'DELIVERED'],
        [{ inDelivery: true, hasRealization: true, hasOrder: true }, 'DELIVERING'],
        [{ hasRealization: true, hasOrder: true, status: 'Согласован' }, 'SHIPPING'],
        [{ hasOrder: true, hasRealization: false, status: 'НаСогласовании' }, 'PICKING'],
        [{ hasOrder: false, status: 'Согласован' }, 'APPROVED'],
        [{ status: 'НаСогласовании' }, 'UNDER_APPROVAL'],
        [{ markedForDeletion: false, delivered: false, status: 'Согласован' }, 'APPROVED'],
        [{ status: 'SomeFutureValue' }, null],
        [{ status: '' }, null],
        [{}, null],
    ])('derives %j -> %s', (facts, expected) => {
        expect(deriveOrderErpStatus(facts)).toBe(expected);
    });
});
