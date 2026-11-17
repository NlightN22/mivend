import { describe, expect, it, vi } from 'vitest';

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: { number?: string }) => `${key}${params?.number ?? ''}`,
    }),
}));

import { useLineChanges } from '../pages/orders/useLineChanges';
import type { OrderDetail } from '../pages/orders/useOrderDetail';

const order = {
    lineChanges: [
        {
            orderLineId: '7',
            ordered: 10,
            actual: 8,
            events: [
                {
                    kind: 'return',
                    titleKey: 'return',
                    subtitleKey: 'fromCustomer',
                    quantity: -2,
                    remainder: 8,
                    documentNumber: '15',
                },
            ],
        },
    ],
} as unknown as OrderDetail;

describe('useLineChanges', () => {
    it('maps events to translated view rows keyed by order line', () => {
        const { hasChanges, changeOf } = useLineChanges(() => order);
        expect(hasChanges.value).toBe(true);
        expect(changeOf('7')?.events[0]).toMatchObject({
            title: 'orders.detail.changes.kinds.return',
            subtitle: 'orders.detail.changes.subtitles.fromCustomer',
            quantity: -2,
            remainder: 8,
            reference: 'orders.detail.changes.document15',
        });
        expect(changeOf('8')).toBeUndefined();
    });

    it('has no changes when the server returns none', () => {
        const { hasChanges } = useLineChanges(
            () => ({ lineChanges: [] }) as unknown as OrderDetail,
        );
        expect(hasChanges.value).toBe(false);
    });
});
