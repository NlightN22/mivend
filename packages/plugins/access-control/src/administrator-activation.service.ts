import { Injectable } from '@nestjs/common';
import { getPageAndCount } from 'shared';
import type { AdministratorListOptions } from '@vendure/common/lib/generated-types';
import { SUPER_ADMIN_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorEvent,
    AdministratorService,
    EventBus,
    ForbiddenError,
    ListQueryBuilder,
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    User,
    UserService,
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
        private userService: UserService,
        private eventBus: EventBus,
    ) {}

    // AdministratorService.findAll/findOne hide soft-deleted rows, so this needs its own query.
    // QueryBuilder won't auto-exclude soft-deleted rows; the explicit deletedAt filter does the work.
    async findDeactivated(
        ctx: RequestContext,
        options?: AdministratorListOptions,
    ): Promise<PaginatedList<Administrator>> {
        const qb = this.listQueryBuilder.build(Administrator, options, { ctx });
        qb.withDeleted().andWhere(`${qb.alias}.deletedAt IS NOT NULL`);
        return getPageAndCount(qb, options?.take, options?.skip);
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
        return getPageAndCount(qb, options?.take, options?.skip);
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
        const admin = await repo.findOne({
            where: { id: administratorId },
            relations: ['user', 'user.roles'],
            withDeleted: true,
        });
        if (!admin) {
            throw new Error(`No Administrator found with id=${administratorId}`);
        }
        if (!isActive && admin.user?.roles?.some(r => r.code === SUPER_ADMIN_ROLE_CODE)) {
            throw new ForbiddenError();
        }
        if (
            !isActive &&
            ctx.activeUserId != null &&
            String(admin.user?.id) === String(ctx.activeUserId)
        ) {
            throw new ForbiddenError();
        }
        const isSoftDeleted = admin.deletedAt != null;
        if (!isActive && !isSoftDeleted) {
            await this.deactivate(ctx, admin);
        } else if (isActive && isSoftDeleted) {
            await this.reactivate(ctx, administratorId);
        }
    }

    // Core softDelete reads the administrator through a role-visibility check, which hides every user whose roles the
    // caller does not hold; this duty must not depend on that, so the same steps run without it.
    private async deactivate(ctx: RequestContext, admin: Administrator): Promise<void> {
        await this.connection
            .getRepository(ctx, Administrator)
            .update({ id: admin.id }, { deletedAt: new Date() });
        await this.userService.softDelete(ctx, admin.user.id);
        await this.eventBus.publish(new AdministratorEvent(ctx, admin, 'deleted', admin.id));
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
