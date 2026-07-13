import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

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

    async findForEntity(
        ctx: RequestContext,
        entityName: string,
        entityId: ID,
    ): Promise<EntityVersion[]> {
        return this.connection.getRepository(ctx, EntityVersion).find({
            where: { entityName, entityId: String(entityId) },
            order: { createdAt: 'DESC' },
        });
    }

    // Batch variant of findForEntity — lets a single "History" widget fetch the trail for a
    // whole object graph (e.g. a Counterparty plus all of its TradingPoints) in one round trip
    // instead of one request per ref. Refs are grouped by entityName so each distinct entity
    // type becomes a single `entityId IN (...)` clause rather than one OR branch per ref.
    async findForEntities(ctx: RequestContext, refs: EntityRef[]): Promise<EntityVersion[]> {
        if (refs.length === 0) return [];
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
        return qb.where(clauses.join(' OR '), params).orderBy('v.createdAt', 'DESC').getMany();
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
