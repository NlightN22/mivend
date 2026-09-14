import { describe, expect, it, vi } from 'vitest';

import { createKafkaLagPollTask } from '../../kafka-lag-poll.scheduled-task';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(
    instanceType: 'central' | 'branch',
    kafkaEnabled = true,
): ErpIntegrationPluginOptions {
    return {
        instanceType,
        kafkaEnabled,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: { brokers: ['x'], clientId: 'x', groupId: 'x', topics: {} as never },
        schemaRegistry: { url: 'http://x' },
    };
}

// Mirrors createReconciliationTask's own gating test shape exactly (issue #91's instruction to
// gate the same way — same external broker, same "is this contour allowed to reach it" question).
describe('createKafkaLagPollTask', () => {
    it('skips on a branch instance', async () => {
        const pollAll = vi.fn();
        const task = createKafkaLagPollTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ pollAll }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(pollAll).not.toHaveBeenCalled();
    });

    it('skips when kafkaEnabled is false, even on a central instance', async () => {
        const pollAll = vi.fn();
        const task = createKafkaLagPollTask(makeOptions('central', false));
        const result = await task.options.execute({
            injector: { get: () => ({ pollAll }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(pollAll).not.toHaveBeenCalled();
    });

    it('polls when central and kafkaEnabled', async () => {
        const pollAll = vi.fn().mockResolvedValue({ polledTopics: 1, failedTopics: [] });
        const task = createKafkaLagPollTask(makeOptions('central', true));
        const result = await task.options.execute({
            injector: { get: () => ({ pollAll }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ polledTopics: 1, failedTopics: [] });
        expect(pollAll).toHaveBeenCalledTimes(1);
    });
});
