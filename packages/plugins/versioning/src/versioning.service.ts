import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { EntityVersion, EntityVersionAction } from './entities/entity-version.entity';

export interface ChangedFieldDiff {
    from: unknown;
    to: unknown;
}

export interface RecordChangeInput {
    entityName: string;
    entityId: ID;
    action: EntityVersionAction;
    changedFields?: Record<string, ChangedFieldDiff>;
    comment?: string;
}

export interface EntityRef {
    entityName: string;
    entityId: ID;
}

@Injectable()
export class VersioningService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
    ) {}

    async recordChange(ctx: RequestContext, input: RecordChangeInput): Promise<EntityVersion> {
        const administratorId = await this.getCallerAdministratorId(ctx);
        const repo = this.connection.getRepository(ctx, EntityVersion);
        const row = repo.create({
            entityName: input.entityName,
            entityId: String(input.entityId),
            action: input.action,
            changedFields:
                input.changedFields && Object.keys(input.changedFields).length > 0
                    ? JSON.stringify(input.changedFields)
                    : null,
            administratorId,
            comment: input.comment ?? null,
        });
        return repo.save(row);
    }

    // Bounded at 300 by default (issue #39) — this was the actual root cause of the
    // "History-tab virtualization e2e flakiness" note in docs/ai/PROJECT_CONTEXT.md: a long dev
    // session accumulates hundreds of EntityVersion rows for a shared e2e counterparty, and an
    // unbounded fetch here meant the row count (and therefore the flakiness) grew forever. A
    // bound is a real fix for THAT specific problem even though it's still a client-side-filtered
    // widget (see EntityHistoryPanel.vue's 5 filter dimensions, several of which are derived from
    // parsed JSON/joined admin names and can't trivially be pushed into SQL — a full
    // server-side-filtered redesign of this generic widget wasn't attempted this session).
    async findForEntity(
        ctx: RequestContext,
        entityName: string,
        entityId: ID,
        take = 300,
    ): Promise<EntityVersion[]> {
        return this.connection.getRepository(ctx, EntityVersion).find({
            where: { entityName, entityId: String(entityId) },
            order: { createdAt: 'DESC' },
            take,
        });
    }

    // Batch variant of findForEntity — lets a single "History" widget fetch the trail for a
    // whole object graph (e.g. a Counterparty plus all of its TradingPoints) in one round trip
    // instead of one request per ref. Refs are grouped by entityName so each distinct entity
    // type becomes a single `entityId IN (...)` clause rather than one OR branch per ref.
    //
    // Real server-side pagination + filtering (issue #39, follow-up to the earlier bounded-only
    // fix) — action/entityName/administratorId/createdAt are plain columns on EntityVersion, so
    // they're pushed into SQL directly, unlike Discounts' 3-way merge or Approvals' resolved
    // customer/order names. Free-text `search` (over the JS-derived changed-fields summary,
    // comment, and joined admin/entity display names) is NOT pushed down — it stays a
    // page-scoped-only filter in EntityHistoryPanel.vue, same documented limitation as
    // Approvals' search.
    async findForEntities(
        ctx: RequestContext,
        refs: EntityRef[],
        options: {
            take?: number;
            skip?: number;
            action?: string;
            entityName?: string;
            administratorId?: string;
            system?: boolean;
            createdAfter?: string;
        } = {},
    ): Promise<PaginatedList<EntityVersion>> {
        if (refs.length === 0) return { items: [], totalItems: 0 };
        const idsByName = new Map<string, string[]>();
        for (const ref of refs) {
            const ids = idsByName.get(ref.entityName) ?? [];
            ids.push(String(ref.entityId));
            idsByName.set(ref.entityName, ids);
        }

        const qb = this.connection.getRepository(ctx, EntityVersion).createQueryBuilder('v');
        const clauses: string[] = [];
        const params: Record<string, unknown> = {};
        let i = 0;
        for (const [entityName, entityIds] of idsByName) {
            clauses.push(`(v.entityName = :name${i} AND v.entityId IN (:...ids${i}))`);
            params[`name${i}`] = entityName;
            params[`ids${i}`] = entityIds;
            i += 1;
        }
        qb.where(clauses.join(' OR '), params);

        if (options.entityName) {
            qb.andWhere('v.entityName = :entityNameFilter', {
                entityNameFilter: options.entityName,
            });
        }
        if (options.action) {
            qb.andWhere('v.action = :actionFilter', { actionFilter: options.action });
        }
        if (options.system) {
            qb.andWhere('v.administratorId IS NULL');
        } else if (options.administratorId) {
            qb.andWhere('v.administratorId = :adminFilter', {
                adminFilter: options.administratorId,
            });
        }
        if (options.createdAfter) {
            qb.andWhere('v.createdAt >= :createdAfter', { createdAfter: options.createdAfter });
        }
        qb.orderBy('v.createdAt', 'DESC');

        const totalItems = await qb.getCount();
        const items = await qb
            .take(options.take ?? 50)
            .skip(options.skip ?? 0)
            .getMany();
        return { items, totalItems };
    }

    // Mirrors ReservationService.getCallerRoleCode's pattern (see
    // packages/plugins/reservation/src/reservation.service.ts) — resolves the acting
    // Administrator from the request's active user rather than trusting a client-supplied id.
    private async getCallerAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
