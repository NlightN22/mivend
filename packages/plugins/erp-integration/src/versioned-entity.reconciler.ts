import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';
import { VERSIONED_ENTITIES, VERSIONED_EVENT_TYPES } from './versioned-entities';
import type { VersionedEventType } from './versioned-entities';
import { VersionedEntityListener } from './versioned-entity.listener';

const loggerCtx = 'VersionedEntityReconciler';
const SWEEP_LIMIT = 100;

// Re-drives a record whose current version has no outbox row at all (crash between the change
// commit and the enqueue). The enqueue is idempotent by key + version, so racing the live listener is safe.
@Injectable()
export class VersionedEntityReconciler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly listener: VersionedEntityListener,
        private readonly requestContextService: RequestContextService,
    ) {}

    async sweep(): Promise<number> {
        let redriven = 0;
        for (const eventType of VERSIONED_EVENT_TYPES) redriven += await this.sweepType(eventType);
        return redriven;
    }

    private async sweepType(eventType: VersionedEventType): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const { table, keyColumn } = VERSIONED_ENTITIES[eventType];
        const { subjectKey, versionKey } = OUTBOUND_EVENT_TYPES[eventType] as {
            subjectKey: string;
            versionKey: string;
        };
        const rows = await ctxQuery<Array<{ key: string; version: number }>>(
            this.connection,
            ctx,
            `SELECT e."${keyColumn}"::text AS key, e.version FROM ${table} e
              WHERE e.version > 0
                AND NOT EXISTS (SELECT 1 FROM integration_outbox x
                                 WHERE x.event_type = $1
                                   AND x.status IN ('pending', 'published', 'failed')
                                   AND x.payload ->> '${subjectKey}' = e."${keyColumn}"::text
                                   AND (x.payload ->> '${versionKey}')::bigint >= e.version)
              ORDER BY e.id ASC LIMIT ${SWEEP_LIMIT}`,
            [eventType],
        );
        let redriven = 0;
        for (const row of rows) {
            try {
                await this.listener.enqueueVersion(ctx, eventType, row.key, row.version);
                redriven += 1;
            } catch (error) {
                Logger.error(
                    `Re-drive of ${eventType} ${row.key} failed: ${String(error)}`,
                    loggerCtx,
                );
            }
        }
        return redriven;
    }
}
