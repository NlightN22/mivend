import { Injectable } from '@nestjs/common';
import {
    Logger,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { ErpUserService } from '@mivend/plugin-access-control';
import { ContactPointService, ErpContactPersonService } from '@mivend/plugin-counterparty';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { IntegrationReapplyCursor } from './entities/integration-reapply-cursor.entity';
import { CounterpartyContactStreamHandler } from './handlers/counterparty-contact.handler';
import { parseContactInfos } from './handlers/contact-infos';
import { MissingDependencyError, loggerCtx } from './types';

// Parents before children, so an owner exists when its channels are applied.
export const REAPPLY_STREAMS = [
    'counterparty',
    'counterparty-contact',
    'point-of-sale',
    'user',
    'organization',
] as const;
export type ReapplyStream = (typeof REAPPLY_STREAMS)[number];

type Applied = 'applied' | 'missing';
type Applier = (
    ctx: RequestContext,
    entityId: string,
    payload: Record<string, unknown>,
) => Promise<Applied>;

const LEASE_MS = 60_000;

export interface ReapplyTickResult {
    applied: number;
    skipped: number;
    finished: boolean;
    locked: boolean;
}

// One-off: re-applies the contact part of already processed inbox rows after the contact model was introduced.
// The inbox dedupes on sourceEventId, so a Kafka offset reset cannot re-deliver them. Idempotent: the channel replace is a set operation.
@Injectable()
export class ContactReapplyService {
    private readonly appliers: Record<ReapplyStream, Applier>;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        counterpartyContacts: CounterpartyContactStreamHandler,
        private readonly contactPoints: ContactPointService,
        private readonly persons: ErpContactPersonService,
        private readonly erpUsers: ErpUserService,
    ) {
        const replace =
            (kind: 'counterparty' | 'tradingPoint' | 'organization'): Applier =>
            async (ctx, entityId, payload) => {
                const infos = parseContactInfos(payload.contactInfos);
                if (!infos) return 'applied';
                return (await this.contactPoints.replaceErpPointsByErpId(
                    ctx,
                    kind,
                    entityId,
                    infos,
                ))
                    ? 'applied'
                    : 'missing';
            };
        const replaceCounterparty = replace('counterparty');
        this.appliers = {
            counterparty: async (ctx, entityId, payload) => {
                const result = await replaceCounterparty(ctx, entityId, payload);
                if (payload.name) await this.persons.linkWaitingContacts(ctx, entityId);
                return result;
            },
            'counterparty-contact': async (ctx, entityId, payload) => {
                await counterpartyContacts.apply(ctx, entityId, payload);
                return 'applied';
            },
            'point-of-sale': replace('tradingPoint'),
            organization: replace('organization'),
            user: async (ctx, entityId, payload) => {
                const infos = parseContactInfos(payload.contactInfos);
                if (!infos) return 'applied';
                await this.erpUsers.setContactInfos(ctx, entityId, JSON.stringify(infos));
                await this.contactPoints.replaceErpPointsByErpId(
                    ctx,
                    'administrator',
                    entityId,
                    infos,
                );
                return 'applied';
            },
        };
    }

    // One bounded tick: LIMITed keyset slices until the budget is spent. Returns locked when another tick holds the lease.
    async runTick(budgetMs: number, sliceSize: number): Promise<ReapplyTickResult> {
        const deadline = Date.now() + budgetMs;
        const total: ReapplyTickResult = { applied: 0, skipped: 0, finished: false, locked: false };
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        for (const stream of REAPPLY_STREAMS) {
            const cursor = await this.cursorOf(ctx, stream);
            if (cursor.done) continue;
            if (!(await this.acquire(ctx, stream))) return { ...total, locked: true };
            try {
                while (Date.now() < deadline) {
                    const slice = await this.runSlice(ctx, stream, sliceSize);
                    total.applied += slice.applied;
                    total.skipped += slice.skipped;
                    if (slice.drained) break;
                }
            } finally {
                await this.release(ctx, stream);
            }
            if (!(await this.cursorOf(ctx, stream)).done) return total;
        }
        return { ...total, finished: true };
    }

    private async runSlice(
        ctx: RequestContext,
        stream: ReapplyStream,
        sliceSize: number,
    ): Promise<{ applied: number; skipped: number; drained: boolean }> {
        const started = Date.now();
        const cursors = this.connection.getRepository(ctx, IntegrationReapplyCursor);
        const cursor = await this.cursorOf(ctx, stream);
        const rows = await this.connection
            .getRepository(ctx, IntegrationInboxEvent)
            .createQueryBuilder('e')
            .where("e.stream = :stream AND e.status = 'processed' AND e.id > :after", {
                stream,
                after: cursor.lastId,
            })
            .andWhere("e.payload <> '{}'::jsonb")
            .orderBy('e.id', 'ASC')
            .limit(sliceSize)
            .getMany();
        let applied = 0;
        let skipped = 0;
        for (const row of rows) {
            if ((await this.applyOne(ctx, stream, row)) === 'applied') applied += 1;
            else skipped += 1;
        }
        const drained = rows.length < sliceSize;
        await cursors.update(
            { stream },
            {
                lastId: rows.length > 0 ? String(rows[rows.length - 1].id) : cursor.lastId,
                done: drained,
                applied: cursor.applied + applied,
                skipped: cursor.skipped + skipped,
            },
        );
        const seconds = Math.max((Date.now() - started) / 1000, 0.001);
        Logger.info(
            `Contact reapply ${stream}: ${applied} applied, ${skipped} skipped in this slice (${(rows.length / seconds).toFixed(0)} rows/s)${drained ? ', stream done' : ''}`,
            loggerCtx,
        );
        return { applied, skipped, drained };
    }

    // A row that cannot apply never stalls the slice: it is counted and the cursor moves on.
    private async applyOne(
        ctx: RequestContext,
        stream: ReapplyStream,
        row: IntegrationInboxEvent,
    ): Promise<Applied> {
        try {
            return await this.connection.withTransaction(ctx, txCtx =>
                this.appliers[stream](txCtx, row.entityId, row.payload),
            );
        } catch (err) {
            if (!(err instanceof MissingDependencyError)) {
                Logger.warn(
                    `Contact reapply ${stream} ${row.entityId}: ${err instanceof Error ? err.message : String(err)}`,
                    loggerCtx,
                );
            }
            return 'missing';
        }
    }

    private async cursorOf(ctx: RequestContext, stream: string): Promise<IntegrationReapplyCursor> {
        const repo = this.connection.getRepository(ctx, IntegrationReapplyCursor);
        await repo.createQueryBuilder().insert().values({ stream }).orIgnore().execute();
        return repo.findOneOrFail({ where: { stream } });
    }

    private async acquire(ctx: RequestContext, stream: string): Promise<boolean> {
        const result = await this.connection
            .getRepository(ctx, IntegrationReapplyCursor)
            .createQueryBuilder()
            .update()
            .set({ lockedUntil: new Date(Date.now() + LEASE_MS) })
            .where('stream = :stream AND ("lockedUntil" IS NULL OR "lockedUntil" < now())', {
                stream,
            })
            .execute();
        return (result.affected ?? 0) > 0;
    }

    private async release(ctx: RequestContext, stream: string): Promise<void> {
        await this.connection
            .getRepository(ctx, IntegrationReapplyCursor)
            .update({ stream }, { lockedUntil: null });
    }
}
