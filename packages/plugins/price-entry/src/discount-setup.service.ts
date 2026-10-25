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

export type DiscountSetupApplyResult = 'applied' | 'unchanged' | 'stale' | 'unknown-condition';
export type DiscountSetupDeactivateResult = 'deactivated' | 'unknown' | 'stale';

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
        const { setup: incoming } = input;
        return withAggregateLock(
            this.connection,
            ctx,
            `discount-setup:${incoming.erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, DiscountSetup);
                const existing = await repo.findOne({ where: { erpId: incoming.erpId } });
                const setup = { ...incoming };
                if (existing && !isVersionNewer(setup.sourceVersion, existing.sourceVersion)) {
                    Logger.warn(
                        `discount-setup ${setup.erpId}: version=${setup.sourceVersion} does not beat the stored version=${existing.sourceVersion}, skipping`,
                        loggerCtx,
                    );
                    return 'stale';
                }
                const unknownCondition =
                    setup.active &&
                    setup.conditionName !== '' &&
                    !(await this.conditionKindExists(txCtx, setup.conditionName));
                if (unknownCondition) {
                    setup.active = false;
                    setup.inactiveReason = `unknown condition ${setup.conditionName}`;
                    Logger.warn(
                        `discount-setup ${setup.erpId}: ${setup.inactiveReason}; add a discount_condition_kind row and resend a newer version`,
                        loggerCtx,
                    );
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
                return unknownCondition ? 'unknown-condition' : 'applied';
            },
        );
    }

    // A tombstone older than the stored version is a replay and changes nothing; at an equal version it
    // applies only while the row is still active. Only a strictly newer upsert reactivates.
    deactivate(
        ctx: RequestContext,
        erpId: string,
        version: string,
    ): Promise<DiscountSetupDeactivateResult> {
        return withAggregateLock(this.connection, ctx, `discount-setup:${erpId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, DiscountSetup);
            const existing = await repo.findOne({ where: { erpId } });
            if (!existing) return 'unknown';
            const newer = isVersionNewer(version, existing.sourceVersion);
            if (!newer && !(version === existing.sourceVersion && existing.active)) return 'stale';
            existing.active = false;
            existing.inactiveReason = 'cancelled';
            if (newer) existing.sourceVersion = version;
            await repo.save(existing);
            return 'deactivated';
        });
    }

    private async conditionKindExists(txCtx: RequestContext, name: string): Promise<boolean> {
        const rows = await ctxQuery<unknown[]>(
            this.connection,
            txCtx,
            `SELECT 1 FROM discount_condition_kind WHERE "erpName" = $1`,
            [name],
        );
        return rows.length > 0;
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
