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

    // Cap prevents e2e flakiness: a shared counterparty accumulates EntityVersion rows without bound.
    // Filters stay client-side; several are derived from parsed JSON/joined names, not pushable to SQL.
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

    // Refs grouped by entityName: one `entityId IN (...)` clause per entity type, not one OR per ref.
    // Free-text search can't go to SQL (JS-derived summary, joined names); it filters only the page.
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

    // Admin is resolved from the active request user, never a client-supplied id (spoofing guard).
    private async getCallerAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
