import { Injectable } from '@nestjs/common';
import { DEFAULT_PREPAYMENT_RESERVE_DAYS, DEFAULT_PROFORMA_PAYMENT_TERM_DAYS } from 'shared';
import {
    GlobalSettingsService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { BranchSettings } from './entities/branch-settings.entity';
import { loggerCtx } from './types';

export interface BranchSettingsInput {
    branchId: string;
    defaultPriceTypeId: string;
    visiblePriceTypeIds?: string[] | null;
    defaultWarehouseId: string;
    visibleWarehouseIds?: string[] | null;
    packagesOnly?: boolean;
    enforceMultiplicity?: boolean;
    allowExceedingCreditLimit?: boolean;
    prepaymentReserveDays?: number;
    proformaPaymentTermDays?: number;
}

// CRUD + fallback resolution for issue #66's per-branch business settings. Never a source of
// RBAC scope (that stays AccessScopeService's job) — this is business configuration only.
@Injectable()
export class BranchSettingsService {
    constructor(
        private connection: TransactionalConnection,
        private globalSettingsService: GlobalSettingsService,
    ) {}

    async getForBranch(ctx: RequestContext, branchId: string): Promise<BranchSettings | null> {
        return this.connection.getRepository(ctx, BranchSettings).findOne({ where: { branchId } });
    }

    async upsert(ctx: RequestContext, input: BranchSettingsInput): Promise<BranchSettings> {
        const term = input.proformaPaymentTermDays;
        if (term !== undefined && (!Number.isInteger(term) || term < 1 || term > 90)) {
            throw new UserInputError('proformaPaymentTermDays must be an integer from 1 to 90');
        }
        const repo = this.connection.getRepository(ctx, BranchSettings);
        let settings = await repo.findOne({ where: { branchId: input.branchId } });
        if (settings) {
            settings.defaultPriceTypeId = input.defaultPriceTypeId;
            settings.visiblePriceTypeIds = input.visiblePriceTypeIds ?? null;
            settings.defaultWarehouseId = input.defaultWarehouseId;
            settings.visibleWarehouseIds = input.visibleWarehouseIds ?? null;
            settings.packagesOnly = input.packagesOnly ?? settings.packagesOnly;
            settings.enforceMultiplicity =
                input.enforceMultiplicity ?? settings.enforceMultiplicity;
            settings.allowExceedingCreditLimit =
                input.allowExceedingCreditLimit ?? settings.allowExceedingCreditLimit;
            settings.prepaymentReserveDays =
                input.prepaymentReserveDays ?? settings.prepaymentReserveDays;
            settings.proformaPaymentTermDays =
                input.proformaPaymentTermDays ?? settings.proformaPaymentTermDays;
        } else {
            settings = repo.create({
                branchId: input.branchId,
                defaultPriceTypeId: input.defaultPriceTypeId,
                visiblePriceTypeIds: input.visiblePriceTypeIds ?? null,
                defaultWarehouseId: input.defaultWarehouseId,
                visibleWarehouseIds: input.visibleWarehouseIds ?? null,
                packagesOnly: input.packagesOnly ?? false,
                enforceMultiplicity: input.enforceMultiplicity ?? false,
                allowExceedingCreditLimit: input.allowExceedingCreditLimit ?? false,
                prepaymentReserveDays:
                    input.prepaymentReserveDays ?? DEFAULT_PREPAYMENT_RESERVE_DAYS,
                proformaPaymentTermDays:
                    input.proformaPaymentTermDays ?? DEFAULT_PROFORMA_PAYMENT_TERM_DAYS,
            });
        }
        const saved = await repo.save(settings);
        Logger.verbose(`Upserted BranchSettings for branchId=${input.branchId}`, loggerCtx);
        return saved;
    }

    // Falls back to global default Branch settings; returns null only if neither is configured.
    // Callers must degrade gracefully (no price, ATP 0) and never fabricate a value.
    async resolveEffective(
        ctx: RequestContext,
        branchId?: string | null,
    ): Promise<BranchSettings | null> {
        if (branchId) {
            const direct = await this.getForBranch(ctx, branchId);
            if (direct) {
                return direct;
            }
        }
        const globalDefaultBranchId = await this.getGlobalDefaultBranchId(ctx);
        if (!globalDefaultBranchId) {
            return null;
        }
        return this.getForBranch(ctx, globalDefaultBranchId);
    }

    async getGlobalDefaultBranchId(ctx: RequestContext): Promise<string | null> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        const customFields = settings.customFields as
            | { defaultBranchId?: string | null }
            | undefined;
        return customFields?.defaultBranchId ?? null;
    }
}
