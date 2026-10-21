import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { NotificationService } from '@mivend/plugin-notification';
import { AccessScopeService, BranchSettingsService } from '@mivend/plugin-access-control';
import { orderBranchClause } from '@mivend/plugin-erp-order';
import { Counterparty } from '@mivend/plugin-counterparty';
import { IsNull } from 'typeorm';

import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';

const OPEN_ISSUES_MAX_TAKE = 100;

export interface OpenReservationReconciliationIssueListOptions {
    take?: number;
    skip?: number;
}

// Report only: a human resolves the drift, so no automatic resolution happens here.
@Injectable()
export class ReservationReconciliationIssueService {
    constructor(
        private connection: TransactionalConnection,
        private notificationService: NotificationService,
        private accessScopeService: AccessScopeService,
        private branchSettingsService: BranchSettingsService,
    ) {}

    async reportQuantityMismatch(
        ctx: RequestContext,
        details: {
            orderId: string;
            productVariantId: string;
            localQuantity: number;
            erpQuantity: number;
            orderEntityId: string;
        },
    ): Promise<ReservationReconciliationIssue> {
        return this.save(ctx, {
            issueType: 'QUANTITY_MISMATCH',
            orderId: details.orderId,
            productVariantId: details.productVariantId,
            localQuantity: details.localQuantity,
            erpQuantity: details.erpQuantity,
            externalProductId: null,
            orderEntityId: details.orderEntityId,
        });
    }

    // An unresolvable productId->ProductVariant mapping must not look like 'ERP not confirmed yet';
    // otherwise release blocks forever with no escalation, so it gets its own issue type.
    async reportUnresolvedProductMapping(
        ctx: RequestContext,
        details: {
            orderId: string;
            externalProductId: string;
            orderEntityId: string;
        },
    ): Promise<ReservationReconciliationIssue> {
        return this.save(ctx, {
            issueType: 'UNRESOLVED_PRODUCT_MAPPING',
            orderId: details.orderId,
            productVariantId: null,
            localQuantity: null,
            erpQuantity: null,
            externalProductId: details.externalProductId,
            orderEntityId: details.orderEntityId,
        });
    }

    // Must mirror OrderVisibilityService.buildVisibleOrdersQuery or branch managers see every branch.
    // Joins raw `order` table for counterpartyId: ReservationReconciliationIssue has no Order relation.
    async findOpen(
        ctx: RequestContext,
        options?: OpenReservationReconciliationIssueListOptions,
    ): Promise<PaginatedList<ReservationReconciliationIssue>> {
        const take = Math.min(options?.take ?? 20, OPEN_ISSUES_MAX_TAKE);
        const skip = options?.skip ?? 0;

        const scope = await this.accessScopeService.resolveOrderScope(ctx);
        const qb = this.connection
            .getRepository(ctx, ReservationReconciliationIssue)
            .createQueryBuilder('issue')
            .where('issue.status = :status', { status: 'open' });

        if (scope.kind !== 'all') {
            qb.leftJoin('order', 'o', 'o.id::text = issue."orderId"').leftJoin(
                Counterparty,
                'counterparty',
                'o."customFieldsCounterpartyid" = counterparty.id::text',
            );
            if (scope.kind === 'own') {
                this.accessScopeService.applyOwnCounterpartyFilter(qb, 'counterparty', scope);
            } else {
                const branch = orderBranchClause(
                    'o',
                    'counterparty',
                    scope.branchId ?? null,
                    await this.branchSettingsService.getGlobalDefaultBranchId(ctx),
                );
                const managers = this.accessScopeService.managerClause(scope, 'counterparty');
                qb.andWhere(`(${branch.sql}${managers ? ` OR ${managers.sql}` : ''})`, {
                    ...branch.params,
                    ...managers?.params,
                });
            }
        }

        const [items, totalItems] = await qb
            .orderBy('issue.detectedAt', 'DESC')
            .addOrderBy('issue.id', 'DESC')
            .take(take)
            .skip(skip)
            .getManyAndCount();

        return { items, totalItems };
    }

    private async save(
        ctx: RequestContext,
        fields: Pick<
            ReservationReconciliationIssue,
            | 'issueType'
            | 'orderId'
            | 'productVariantId'
            | 'localQuantity'
            | 'erpQuantity'
            | 'externalProductId'
            | 'orderEntityId'
        >,
    ): Promise<ReservationReconciliationIssue> {
        const repo = this.connection.getRepository(ctx, ReservationReconciliationIssue);

        // Handler is not atomic: a retry after a partial failure re-runs it and would duplicate the issue.
        // Dedupe only against open issues; a resolved match is a new, distinct occurrence.
        const existing = await repo.findOne({
            where: {
                issueType: fields.issueType,
                orderId: fields.orderId,
                productVariantId: fields.productVariantId ?? IsNull(),
                externalProductId: fields.externalProductId ?? IsNull(),
                status: 'open',
            },
        });
        if (existing) {
            return existing;
        }

        const saved = await repo.save(
            repo.create({
                ...fields,
                detectedAt: new Date(),
                status: 'open',
                resolution: null,
            }),
        );

        // Runs from an inbox handler with no signed-in admin, so getCurrentAdministrator returns null.
        // Hence broadcast to every administrator rather than skipping the notification.
        await this.notificationService.create(ctx, {
            recipientType: 'administrator-broadcast',
            kind: 'warning',
            sourceType: 'reservation-reconciliation',
            // Dedupe on the same key as save()'s `existing` lookup, not saved.id: a repeat must update
            // the one open notification, not create another.
            sourceId: `${fields.issueType}:${fields.orderId}:${fields.productVariantId ?? ''}:${fields.externalProductId ?? ''}`,
            title: 'Reservation/ERP drift detected',
            message: `${fields.issueType} for order ${fields.orderId}`,
        });

        return saved;
    }
}
