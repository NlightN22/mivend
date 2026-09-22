import { describe, expect, it, vi } from 'vitest';

import { createReconciliationTask } from '../../reconciliation.scheduled-task';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(
    instanceType: 'central' | 'branch',
    kafkaEnabled = true,
): ErpIntegrationPluginOptions {
    return {
        instanceType,
        kafkaEnabled,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'x',
            topics: {
                category: 'c',
                organization: 'o',
                warehouse: 'w',
                'price-type': 'pt',
                product: 'p',
                offer: 'of',
                price: 'pr',
                stock: 's',
                'storage-location': 'sl',
                'stock-organization': 'so',
                'order-registration-result': 'orr',
                'order-changed': 'oc',
                department: 'dept',
                counterparty: 'cp',
                'counterparty-credit-balance': 'cpcb',
                user: 'usr',
                'promo-rule': 'pr2',
                'vat-rate': 'vr2',
            },
        },
        schemaRegistry: { url: 'http://x' },
        reconciliationApiUrl: 'https://is.test',
        reconciliationApiKey: 'test-key',
    };
}

// Mirrors createIntegrationOutboxTask's own gating test shape exactly, per issue #84's
// instruction to mirror that task's central/kafkaEnabled gate.
describe('createReconciliationTask', () => {
    it('skips on a branch instance', async () => {
        const runComparison = vi.fn();
        const task = createReconciliationTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ runComparison }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(runComparison).not.toHaveBeenCalled();
    });

    it('skips when kafkaEnabled is false, even on a central instance', async () => {
        const runComparison = vi.fn();
        const task = createReconciliationTask(makeOptions('central', false));
        const result = await task.options.execute({
            injector: { get: () => ({ runComparison }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(runComparison).not.toHaveBeenCalled();
    });

    it('runs the comparison as a scheduled trigger on a central instance with Kafka enabled', async () => {
        const runComparison = vi
            .fn()
            .mockResolvedValue({ checked: 5, issuesFound: 0, skipped: [] });
        const task = createReconciliationTask(makeOptions('central', true));
        const result = await task.options.execute({
            injector: { get: () => ({ runComparison }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(runComparison).toHaveBeenCalledWith({ triggeredBy: 'scheduled' });
        expect(result).toEqual({ checked: 5, issuesFound: 0, skipped: [] });
    });
});
