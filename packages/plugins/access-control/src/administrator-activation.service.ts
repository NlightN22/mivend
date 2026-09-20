import { Injectable } from '@nestjs/common';
import { AdministratorListOptions } from '@vendure/common/lib/generated-types';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorService,
    ListQueryBuilder,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    User,
} from '@vendure/core';

import { loggerCtx } from './types';

// Issue #119, Decision 1/2: `deletedAt` (Vendure's native soft-delete) is the deactivation
// mechanism — a real login block (UserService.getUserByEmailAddress filters
// `WHERE user.deletedAt IS NULL`), not a custom isActive flag. 1C is trusted as master for this
// state and applied automatically, no human confirmation step (same "ERP is master" principle as
// Counterparty.assignedManagerId/departmentId elsewhere in this plugin).
@Injectable()
export class AdministratorActivationService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // Backs the Dashboard "ERP users" > Deactivated screen's ListPage. Structurally distinct
    // from the native `administrators` query, not a filter on top of it: AdministratorService.
    // findAll/findOne hard-filter `deletedAt IS NULL` in @vendure/core itself, so a soft-deleted
    // Administrator is invisible there no matter what options are passed — see Decision 1/Phase 1
    // of issue #119. TypeORM's QueryBuilder (unlike its Repository.find methods) does not
    // auto-exclude soft-deleted rows, so `.withDeleted()` here is a no-op safety net; the real
    // work is the explicit `deletedAt IS NOT NULL` filter, which is what actually restricts this
    // to deactivated accounts.
    async findDeactivated(
        ctx: RequestContext,
        options?: AdministratorListOptions,
    ): Promise<PaginatedList<Administrator>> {
        const qb = this.listQueryBuilder.build(Administrator, options, { ctx });
        qb.withDeleted()
            .andWhere(`${qb.alias}.deletedAt IS NOT NULL`)
            .andWhere(`${qb.alias}.customFieldsErpid IS NOT NULL`);
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // Driven by UserChanged's own isActive/isDeleted — a no-op when no Administrator has ever
    // been linked to this erpId (nothing to deactivate).
    async syncFromErp(ctx: RequestContext, erpId: string, isActive: boolean): Promise<void> {
        const admin = await this.findByErpId(ctx, erpId);
        if (!admin) return;
        const isSoftDeleted = admin.deletedAt != null;
        if (!isActive && !isSoftDeleted) {
            await this.administratorService.softDelete(ctx, admin.id);
            Logger.verbose(
                `Deactivated administrator erpId=${erpId} (1C reported inactive)`,
                loggerCtx,
            );
        } else if (isActive && isSoftDeleted) {
            await this.reactivate(ctx, admin.id);
            Logger.verbose(
                `Reactivated administrator erpId=${erpId} (1C reported active)`,
                loggerCtx,
            );
        }
    }

    // Manual override on top of syncFromErp above — e.g. for a case 1C hasn't caught up on yet,
    // or a deliberate business exception.
    async setActive(ctx: RequestContext, administratorId: ID, isActive: boolean): Promise<void> {
        const repo = this.connection.getRepository(ctx, Administrator);
        const admin = await repo.findOne({ where: { id: administratorId }, withDeleted: true });
        if (!admin) {
            throw new Error(`No Administrator found with id=${administratorId}`);
        }
        const isSoftDeleted = admin.deletedAt != null;
        if (!isActive && !isSoftDeleted) {
            await this.administratorService.softDelete(ctx, administratorId);
        } else if (isActive && isSoftDeleted) {
            await this.reactivate(ctx, administratorId);
        }
    }

    // No public Vendure API for this (only an internal superadmin-recovery code path exists) —
    // a direct repo write clearing deletedAt on both Administrator and its linked User, same
    // "raw repo write when Vendure's own service API doesn't cover an operation" convention as
    // DepartmentService/CounterpartyService.upsertActiveState.
    private async reactivate(ctx: RequestContext, administratorId: ID): Promise<void> {
        const adminRepo = this.connection.getRepository(ctx, Administrator);
        const admin = await adminRepo.findOne({
            where: { id: administratorId },
            relations: ['user'],
            withDeleted: true,
        });
        if (!admin) return;
        admin.deletedAt = null;
        await adminRepo.save(admin);
        if (admin.user) {
            const userRepo = this.connection.getRepository(ctx, User);
            await userRepo.update({ id: admin.user.id }, { deletedAt: null });
        }
    }

    private async findByErpId(ctx: RequestContext, erpId: string): Promise<Administrator | null> {
        return this.connection
            .getRepository(ctx, Administrator)
            .findOne({ where: { customFields: { erpId } }, withDeleted: true });
    }
}
