import { Injectable } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { In } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { IntegrationInboxReplayStateService } from './integration-inbox-replay-state.service';
import { REPLAY_MAX_IDS, ResyncReplayClient } from './resync-replay.client';
import { streamToAggregateType } from './stream-aggregate-type';
import { loggerCtx } from './types';

export type InboxReplayOutcome =
    | 'REPLAYED'
    | 'NOT_FOUND'
    | 'UNSUPPORTED'
    | 'NOT_FAILED'
    | 'FAILED'
    | 'UNDECODABLE';

export interface InboxReplayResult {
    id: string;
    stream: string;
    entityId: string;
    outcome: InboxReplayOutcome;
    message: string | null;
}

interface ClaimedRow {
    id: number;
    stream: string;
    entityId: string;
}

// A replayed row stays replay_requested until the re-published event is processed (markProcessed);
// otherwise it reverts to failed.
@Injectable()
export class IntegrationInboxReplayService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly replayClient: ResyncReplayClient,
        private readonly state: IntegrationInboxReplayStateService,
    ) {}

    async replayFailed(ctx: RequestContext, ids: number[]): Promise<InboxReplayResult[]> {
        const rows = await this.connection.getRepository(ctx, IntegrationInboxEvent).find({
            where: { id: In(ids) },
            select: ['id', 'stream', 'entityId', 'status', 'undecodable'],
        });
        const results: InboxReplayResult[] = [];
        const eligible: number[] = [];
        for (const row of rows) {
            const base = { id: String(row.id), stream: row.stream, entityId: row.entityId };
            if (row.status !== 'failed') {
                results.push({ ...base, outcome: 'NOT_FAILED', message: `Row is ${row.status}` });
            } else if (row.undecodable) {
                results.push({
                    ...base,
                    outcome: 'UNDECODABLE',
                    message:
                        'message could not be decoded, no entity id to replay — dismiss it instead',
                });
            } else if (!streamToAggregateType(row.stream)) {
                results.push({
                    ...base,
                    outcome: 'UNSUPPORTED',
                    message: 'Replay is not available for this stream',
                });
            } else {
                eligible.push(Number(row.id));
            }
        }
        // Atomic claim: of two concurrent clicks only one gets the row, so Integration Service is asked once.
        const claimed = await this.state.claimForReplay(ctx, eligible);
        const claimedIds = new Set(claimed.map(c => c.id));
        for (const id of eligible) {
            const row = rows.find(r => Number(r.id) === id);
            if (row && !claimedIds.has(id)) {
                results.push({
                    id: String(id),
                    stream: row.stream,
                    entityId: row.entityId,
                    outcome: 'NOT_FAILED',
                    message: 'Replay was already requested',
                });
            }
        }
        const byType = new Map<string, ClaimedRow[]>();
        for (const row of claimed) {
            const type = streamToAggregateType(row.stream as never) as string;
            byType.set(type, [...(byType.get(type) ?? []), row]);
        }
        for (const [aggregateType, group] of byType) {
            results.push(...(await this.replayGroup(ctx, aggregateType, group)));
        }
        return results;
    }

    private async replayGroup(
        ctx: RequestContext,
        aggregateType: string,
        group: ClaimedRow[],
    ): Promise<InboxReplayResult[]> {
        const statusByEntity = new Map<string, string>();
        let failure: string | null = null;
        try {
            const entityIds = [...new Set(group.map(row => row.entityId))];
            for (let i = 0; i < entityIds.length; i += REPLAY_MAX_IDS) {
                for (const r of await this.replayClient.replay(
                    aggregateType,
                    entityIds.slice(i, i + REPLAY_MAX_IDS),
                )) {
                    statusByEntity.set(r.entityId, r.status);
                }
            }
        } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
            Logger.error(`Inbox replay of ${aggregateType} failed: ${failure}`, loggerCtx);
        }
        const results: InboxReplayResult[] = [];
        for (const row of group) {
            const base = { id: String(row.id), stream: row.stream, entityId: row.entityId };
            const status = statusByEntity.get(row.entityId);
            if (failure === null && status?.startsWith('replayed')) {
                results.push({ ...base, outcome: 'REPLAYED', message: status });
                continue;
            }
            const reason = failure ?? status ?? 'No answer for this id';
            await this.state.releaseClaim(
                ctx,
                [row.id],
                `Integration Service did not accept the replay: ${reason}`,
            );
            results.push({
                ...base,
                outcome: failure !== null ? 'FAILED' : 'NOT_FOUND',
                message: reason,
            });
        }
        return results;
    }
}
