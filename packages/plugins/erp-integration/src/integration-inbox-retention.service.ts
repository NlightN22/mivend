import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import type { InboundStream } from './types';
import { isVersionNewer } from './version-compare';

// Retention (#147): each purge tick only looks at this many (stream, entityId) groups with more
// than one `processed` row, so a huge backlog of duplicates can't turn one purge tick into a
// single unbounded DELETE — the scheduled task just takes more ticks instead.
const PURGE_SUPERSEDED_GROUP_BATCH_SIZE = 200;

// Retention of processed inbox rows, split from IntegrationInboxService (claim/retry code).
@Injectable()
export class IntegrationInboxRetentionService {
    constructor(private readonly dataSource: DataSource) {}

    // Retention (#147): only the latest processed version per (stream, entityId) is read
    // (isSupersededByNewerVersion) — tombstones (payload={}) every older duplicate's payload but
    // keeps the row, since it's the enqueue dedup key and deleting it would let a real Kafka
    // redelivery pass dedup as new and reapply stale data (audit HIGH finding).
    async purgeSupersededProcessedRows(): Promise<number> {
        const repo = this.dataSource.getRepository(IntegrationInboxEvent);
        const tombstone = {};

        const groups = await repo
            .createQueryBuilder('event')
            .select('event.stream', 'stream')
            .addSelect('event.entity_id', 'entityId')
            .where('event.status = :status', { status: 'processed' })
            .andWhere(`event.payload <> '{}'::jsonb`)
            .groupBy('event.stream')
            .addGroupBy('event.entity_id')
            .having('COUNT(*) > 1')
            .limit(PURGE_SUPERSEDED_GROUP_BATCH_SIZE)
            .getRawMany<{ stream: InboundStream; entityId: string }>();

        if (groups.length === 0) return 0;

        let tombstoned = 0;
        for (const group of groups) {
            const rows = await repo
                .createQueryBuilder('event')
                .select(['event.id', 'event.version'])
                .where('event.stream = :stream', { stream: group.stream })
                .andWhere('event.entityId = :entityId', { entityId: group.entityId })
                .andWhere('event.status = :status', { status: 'processed' })
                .andWhere(`event.payload <> '{}'::jsonb`)
                .getMany();
            // isVersionNewer, not a SQL/lexicographic MAX(version) — version is not guaranteed
            // fixed-width (see the entity's own column comment), same rule as
            // IntegrationInboxProcessorService.isSupersededByNewerVersion.
            let newest = rows[0];
            for (const row of rows.slice(1)) {
                if (isVersionNewer(row.version, newest.version)) newest = row;
            }
            const idsToTombstone = rows.filter(row => row.id !== newest.id).map(row => row.id);
            if (idsToTombstone.length === 0) continue;
            await repo.update(idsToTombstone, { payload: tombstone });
            tombstoned += idsToTombstone.length;
        }
        return tombstoned;
    }
}
