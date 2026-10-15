import { Injectable } from '@nestjs/common';
import type { AdministratorListOptions } from '@vendure/common/lib/generated-types';
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

// Uses Vendure's native soft-delete (deletedAt) so deactivation is a real login block,
// not a custom flag; ERP is master for this state, applied without human confirmation.
@Injectable()
export class AdministratorActivationService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    // AdministratorService.findAll/findOne hide soft-deleted rows, so this needs its own query.
    // QueryBuilder won't auto-exclude soft-deleted rows; the explicit deletedAt filter does the work.
    async findDeactivated(
        ctx: RequestContext,
        options?: AdministratorListOptions,
    ): Promise<PaginatedList<Administrator>> {
        const qb = this.listQueryBuilder.build(Administrator, options, { ctx });
        qb.withDeleted().andWhere(`${qb.alias}.deletedAt IS NOT NULL`);
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // AdministratorService.findAll hard-filters deletedAt IS NULL, so a status filter can't use it.
    // Hence QueryBuilder with an explicit deletedAt predicate; not erpId-scoped, unlike findDeactivated.
    async findAllWithStatus(
        ctx: RequestContext,
        options: AdministratorListOptions | undefined,
        status: 'active' | 'inactive' | undefined,
    ): Promise<PaginatedList<Administrator>> {
        const qb = this.listQueryBuilder.build(Administrator, options, {
            ctx,
            relations: ['user', 'user.roles'],
        });
        qb.withDeleted();
        if (status === 'active') {
            qb.andWhere(`${qb.alias}.deletedAt IS NULL`);
        } else if (status === 'inactive') {
            qb.andWhere(`${qb.alias}.deletedAt IS NOT NULL`);
        }
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
                `Deactivated administrator erpId=${erpId} (the ERP reported inactive)`,
                loggerCtx,
            );
        } else if (isActive && isSoftDeleted) {
            await this.reactivate(ctx, admin.id);
            Logger.verbose(
                `Reactivated administrator erpId=${erpId} (the ERP reported active)`,
                loggerCtx,
            );
        }
    }

    // Manual override on top of syncFromErp above — e.g. for a case the ERP hasn't caught up on yet,
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

    // No public Vendure API clears deletedAt (only an internal superadmin-recovery path exists),
    // so this is a raw repo write on Administrator and its linked User, as in upsertActiveState.
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
