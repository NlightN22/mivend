import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { contentHash, ctxQuery, replaceMembership, withAggregateLock } from 'shared';

import { DiscountSetup } from './discount-setup.entity';
import { loggerCtx } from './types';
import { isVersionNewer } from './granted-version-compare';

export interface DiscountSetupValues {
    erpId: string;
    documentNumber: string;
    percent: number;
    conditionName: string;
    conditionNumber: number | null;
    priceTypeErpId: string | null;
    limitPercent: number | null;
    validFrom: Date;
    validTo: Date | null;
    active: boolean;
    inactiveReason: string | null;
    allProducts: boolean;
    productMode: string;
    productFilter: unknown[] | null;
    sourceVersion: string;
}

export interface DiscountRecipientInput {
    counterpartyErpId: string;
    contractErpId: string;
}

export interface DiscountSetupInput {
    setup: DiscountSetupValues;
    recipients: DiscountRecipientInput[];
    productErpIds: string[];
}

export type DiscountSetupApplyResult = 'applied' | 'unchanged' | 'stale';

const PRODUCT_LIST = {
    table: 'discount_setup_product',
    ownerColumn: 'setupId',
    valueColumn: 'productErpId',
};

// Issue #289/#290: one row per ERP setup document; a newer version replaces the rule and both member sets.
@Injectable()
export class DiscountSetupService {
    constructor(private connection: TransactionalConnection) {}

    apply(ctx: RequestContext, input: DiscountSetupInput): Promise<DiscountSetupApplyResult> {
        const { setup } = input;
        return withAggregateLock(
            this.connection,
            ctx,
            `discount-setup:${setup.erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, DiscountSetup);
                const existing = await repo.findOne({ where: { erpId: setup.erpId } });
                if (existing && !isVersionNewer(setup.sourceVersion, existing.sourceVersion)) {
                    Logger.warn(
                        `discount-setup ${setup.erpId}: version=${setup.sourceVersion} does not beat the stored version=${existing.sourceVersion}, skipping`,
                        loggerCtx,
                    );
                    return 'stale';
                }
                const recipients = setup.active ? input.recipients : [];
                const products = setup.active && !setup.allProducts ? input.productErpIds : [];
                const hash = contentHash({ ...setup, sourceVersion: undefined }, [
                    recipients.map(r => `${r.counterpartyErpId}\u0002${r.contractErpId}`),
                    products,
                ]);
                const unchanged = existing !== null && existing.contentHash === hash;
                const wasActive = existing?.active === true;
                const values = { ...setup, contentHash: hash };
                const saved = await repo.save(
                    existing ? Object.assign(existing, values) : repo.create(values),
                );
                if (unchanged) return wasActive ? 'unchanged' : 'applied';
                const setupId = saved.id as number;
                await this.replaceRecipients(txCtx, setupId, recipients);
                await replaceMembership(this.connection, txCtx, PRODUCT_LIST, setupId, products);
                return 'applied';
            },
        );
    }

    // Cancellation wins regardless of version; the newest version seen is kept so only a strictly newer upsert reactivates.
    deactivate(ctx: RequestContext, erpId: string, version: string): Promise<boolean> {
        return withAggregateLock(this.connection, ctx, `discount-setup:${erpId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, DiscountSetup);
            const existing = await repo.findOne({ where: { erpId } });
            if (!existing) return false;
            existing.active = false;
            existing.inactiveReason = 'cancelled';
            if (version && isVersionNewer(version, existing.sourceVersion)) {
                existing.sourceVersion = version;
            }
            await repo.save(existing);
            return true;
        });
    }

    private async replaceRecipients(
        txCtx: RequestContext,
        setupId: number,
        recipients: DiscountRecipientInput[],
    ): Promise<void> {
        await ctxQuery(
            this.connection,
            txCtx,
            `DELETE FROM discount_setup_recipient WHERE "setupId" = $1`,
            [setupId],
        );
        if (recipients.length === 0) return;
        await ctxQuery(
            this.connection,
            txCtx,
            `INSERT INTO discount_setup_recipient ("setupId", "counterpartyErpId", "contractErpId")
             SELECT $1, c, k FROM unnest($2::text[], $3::text[]) AS t(c, k) ON CONFLICT DO NOTHING`,
            [
                setupId,
                recipients.map(r => r.counterpartyErpId),
                recipients.map(r => r.contractErpId),
            ],
        );
    }
}
