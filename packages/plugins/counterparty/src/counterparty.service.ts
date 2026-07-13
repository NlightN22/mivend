import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    AdministratorService,
    CustomerService,
    ForbiddenError,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyUpsertPayload, loggerCtx } from './types';

@Injectable()
export class CounterpartyService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private customerPricingService: CustomerPricingService,
        private accessScopeService: AccessScopeService,
        private administratorService: AdministratorService,
    ) {}

    async upsert(ctx: RequestContext, payload: CounterpartyUpsertPayload): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        let record = await repo.findOne({ where: { erpId: payload.erpId } });
        if (record) {
            Object.assign(record, payload);
        } else {
            record = repo.create(payload);
        }
        const saved = await repo.save(record);
        Logger.verbose(`Upserted counterparty erpId=${payload.erpId}`, loggerCtx);
        return saved;
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { isActive: false });
        Logger.verbose(`Deactivated counterparty erpId=${erpId}`, loggerCtx);
    }

    async updateCredit(
        ctx: RequestContext,
        erpId: string,
        creditLimit: number,
        creditBalance: number,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        await repo.update({ erpId }, { creditLimit, creditBalance });
        Logger.verbose(`Updated credit for erpId=${erpId}`, loggerCtx);
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Counterparty | null> {
        return this.connection.getRepository(ctx, Counterparty).findOne({ where: { erpId } });
    }

    async findAll(ctx: RequestContext): Promise<Counterparty[]> {
        return this.connection
            .getRepository(ctx, Counterparty)
            .find({ order: { shortName: 'ASC' } });
    }

    /**
     * Row-level visibility for the admin `counterparties` query — resolves the caller's scope
     * via AccessScopeService and filters accordingly. See docs/access-control.md, layer 3.
     */
    async findVisible(ctx: RequestContext): Promise<Counterparty[]> {
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        const qb = this.connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .orderBy('c.shortName', 'ASC');
        switch (scope.kind) {
            case 'own':
                qb.where('c.assignedManagerId = :id', { id: scope.administratorId ?? null });
                break;
            case 'department':
                qb.where('c.departmentId = :d AND c.branchId = :b', {
                    d: scope.departmentId ?? null,
                    b: scope.branchId ?? null,
                });
                break;
            case 'all':
                break;
        }
        return qb.getMany();
    }

    async getForCustomer(ctx: RequestContext, customerId: ID): Promise<Counterparty | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return result[0] ?? null;
    }

    async setCustomerCounterparty(
        ctx: RequestContext,
        customerId: ID,
        erpId: string,
    ): Promise<void> {
        const counterparty = await this.findByErpId(ctx, erpId);
        if (!counterparty) throw new UserInputError(`Counterparty not found: erpId=${erpId}`);
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { counterpartyId: counterparty.id } as Record<string, unknown>,
        });
        await this.assignPriceType(ctx, customerId, counterparty.priceType);
    }

    async setCustomerRole(ctx: RequestContext, customerId: ID, role: string): Promise<void> {
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { portalRole: role } as Record<string, unknown>,
        });
    }

    // Changes assignedManagerId — department-head only within their own department, portal-admin
    // unrestricted, matching CustomPermission.ReassignCounterpartyManager's doc comment. Reuses
    // AccessScopeService's counterparty scope resolution rather than a bespoke role check: a
    // 'department' scope caller may only reassign a counterparty already in their own
    // department/branch, and only to an administrator who is themselves in that same
    // department (never lending a client out to a manager the dept-head doesn't oversee).
    async reassignManager(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
    ): Promise<Counterparty> {
        const repo = this.connection.getRepository(ctx, Counterparty);
        const counterparty = await repo.findOne({ where: { id: counterpartyId } });
        if (!counterparty) throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);

        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        if (scope.kind === 'department') {
            if (
                counterparty.departmentId !== (scope.departmentId ?? null) ||
                counterparty.branchId !== (scope.branchId ?? null)
            ) {
                throw new ForbiddenError();
            }
            const target = await this.administratorService.findOne(ctx, administratorId);
            const targetDepartmentId = (
                target?.customFields as { departmentId?: string | null } | undefined
            )?.departmentId;
            if (!target || targetDepartmentId !== scope.departmentId) {
                throw new ForbiddenError();
            }
        } else if (scope.kind !== 'all') {
            throw new ForbiddenError();
        }

        counterparty.assignedManagerId = String(administratorId);
        const saved = await repo.save(counterparty);
        Logger.verbose(
            `Reassigned counterparty id=${counterpartyId} to administrator=${administratorId}`,
            loggerCtx,
        );
        return saved;
    }

    private async assignPriceType(
        ctx: RequestContext,
        customerId: ID,
        priceType: string,
    ): Promise<void> {
        await this.customerPricingService.assignCustomerPriceTypeByCode(ctx, customerId, priceType);
        Logger.verbose(`Assigned customer ${customerId} to price type "${priceType}"`, loggerCtx);
    }
}
