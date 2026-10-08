import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import { DataSource, In } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { REPLAY_MAX_IDS, ResyncReplayClient } from './resync-replay.client';
import { streamToAggregateType } from './stream-aggregate-type';
import { loggerCtx } from './types';

export type InboxReplayOutcome = 'REPLAYED' | 'NOT_FOUND' | 'UNSUPPORTED' | 'NOT_FAILED' | 'FAILED';

export interface InboxReplayResult {
    id: string;
    stream: string;
    entityId: string;
    outcome: InboxReplayOutcome;
    message: string | null;
}

// Asks Integration Service to re-publish dead-lettered entities; the new event arrives through
// the normal consumer. A replayed row becomes 'resolved' so the Failed count reflects open work.
@Injectable()
export class IntegrationInboxReplayService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly replayClient: ResyncReplayClient,
    ) {}

    async replayFailed(ids: number[]): Promise<InboxReplayResult[]> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const rows = await repo.find({
            where: { id: In(ids) },
            select: ['id', 'stream', 'entityId', 'status'],
        });
        const results: InboxReplayResult[] = [];
        const byType = new Map<string, IntegrationInboxEvent[]>();
        for (const row of rows) {
            const base = { id: String(row.id), stream: row.stream, entityId: row.entityId };
            const aggregateType = streamToAggregateType(row.stream);
            if (row.status !== 'failed') {
                results.push({ ...base, outcome: 'NOT_FAILED', message: `Row is ${row.status}` });
            } else if (!aggregateType) {
                results.push({
                    ...base,
                    outcome: 'UNSUPPORTED',
                    message: 'Replay is not available for this stream',
                });
            } else {
                byType.set(aggregateType, [...(byType.get(aggregateType) ?? []), row]);
            }
        }
        for (const [aggregateType, group] of byType) {
            results.push(...(await this.replayGroup(aggregateType, group)));
        }
        return results;
    }

    private async replayGroup(
        aggregateType: string,
        group: IntegrationInboxEvent[],
    ): Promise<InboxReplayResult[]> {
        const results: InboxReplayResult[] = [];
        const replayedIds: number[] = [];
        const entityIds = [...new Set(group.map(row => row.entityId))];
        const statusByEntity = new Map<string, string>();
        let failure: string | null = null;
        try {
            for (let i = 0; i < entityIds.length; i += REPLAY_MAX_IDS) {
                const chunk = entityIds.slice(i, i + REPLAY_MAX_IDS);
                for (const r of await this.replayClient.replay(aggregateType, chunk)) {
                    statusByEntity.set(r.entityId, r.status);
                }
            }
        } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
            Logger.error(`Inbox replay of ${aggregateType} failed: ${failure}`, loggerCtx);
        }
        for (const row of group) {
            const base = { id: String(row.id), stream: row.stream, entityId: row.entityId };
            const status = statusByEntity.get(row.entityId);
            if (failure !== null) {
                results.push({ ...base, outcome: 'FAILED', message: failure });
            } else if (status?.startsWith('replayed')) {
                replayedIds.push(row.id);
                results.push({ ...base, outcome: 'REPLAYED', message: status });
            } else {
                results.push({
                    ...base,
                    outcome: 'NOT_FOUND',
                    message: status ?? 'No answer for this id',
                });
            }
        }
        if (replayedIds.length > 0) {
            await this.dataSource
                .getRepository(IntegrationInboxEvent)
                .update({ id: In(replayedIds), status: 'failed' }, { status: 'resolved' });
        }
        return results;
    }
}
