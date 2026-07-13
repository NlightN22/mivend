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

    // Mirrors ReservationService.getCallerRoleCode's pattern (see
    // packages/plugins/reservation/src/reservation.service.ts) — resolves the acting
    // Administrator from the request's active user rather than trusting a client-supplied id.
    private async getCallerAdministratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        return admin ? String(admin.id) : null;
    }
}
