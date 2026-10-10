import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import {
    HistoryService,
    Order,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    ContractService,
    CounterpartyService,
    isSelectableContract,
} from '@mivend/plugin-counterparty';
import type { Contract, Counterparty } from '@mivend/plugin-counterparty';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { withAggregateLock } from 'shared';

import { ReservationService } from './reservation.service';

export interface OrderContractOption {
    erpId: string;
    name: string | null;
    organizationId: string;
    organizationName: string | null;
    paymentKind: string | null;
    isMain: boolean;
    isSelected: boolean;
}

const CHANGEABLE_ERP_STATUSES = [null, undefined, 'PENDING'];

// The contract an order is registered under in the ERP (#205). It can change until the order has
// been reserved, because reservation is what publishes order.confirmed.
@Injectable()
export class OrderContractService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly contractService: ContractService,
        private readonly visibility: OrderVisibilityService,
        private readonly reservationService: ReservationService,
        private readonly historyService: HistoryService,
    ) {}

    async list(ctx: RequestContext, orderId: ID): Promise<OrderContractOption[]> {
        const order = await this.findVisibleOrder(ctx, orderId);
        return this.options(ctx, order.customerId, order.customFields?.selectedContractId);
    }

    async set(
        ctx: RequestContext,
        orderId: ID,
        contractErpId: string,
    ): Promise<OrderContractOption[]> {
        await this.findVisibleOrder(ctx, orderId);
        // Same key as reserveOrder: the "not reserved yet" check and the write must be atomic with it.
        return withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, async txCtx => {
            const order = await this.findVisibleOrder(txCtx, orderId);
            const counterparty = await this.counterpartyOf(txCtx, order);
            const contract = await this.contractService.findByErpId(txCtx, contractErpId);
            if (!isSelectableContract(contract, String(counterparty.id))) {
                throw new UserInputError('This contract cannot be used for the order');
            }
            if (!CHANGEABLE_ERP_STATUSES.includes(order.customFields?.erpStatus)) {
                throw new UserInputError('The order is already registered in the ERP');
            }
            const reservations = await this.reservationService.findForOrder(txCtx, orderId);
            if (reservations.some(r => r.status === 'active')) {
                throw new UserInputError('Release the reservation before changing the contract');
            }

            const previous = order.customFields?.selectedContractId ?? null;
            if (previous !== contract.erpId) {
                await this.connection
                    .getRepository(txCtx, Order)
                    .query(
                        `UPDATE "order" SET "customFieldsSelectedcontractid" = $2 WHERE id = $1`,
                        [order.id, contract.erpId],
                    );
                await this.historyService.createHistoryEntryForOrder(
                    {
                        ctx: txCtx,
                        orderId,
                        type: HistoryEntryType.ORDER_NOTE,
                        data: {
                            note: `Contract changed from ${previous ?? 'none'} to ${contract.erpId}`,
                        },
                    },
                    false,
                );
            }
            // Never copy the Order entity: spreading it evaluates Vendure's calculated getters
            // (taxSummary needs relations this query does not load).
            return this.options(txCtx, order.customerId, contract.erpId);
        });
    }

    private async options(
        ctx: RequestContext,
        customerId: ID | undefined,
        selectedContractId: string | null | undefined,
    ): Promise<OrderContractOption[]> {
        const counterparty = customerId
            ? await this.counterpartyService.getForCustomer(ctx, customerId)
            : null;
        if (!counterparty) return [];
        const [contracts, current] = await Promise.all([
            this.contractService.findActiveForCounterparty(ctx, counterparty.id),
            this.contractService.resolveOrderContract(
                ctx,
                counterparty,
                selectedContractId,
                customerId,
            ),
        ]);
        const names = await this.organizationNames(contracts);
        return contracts
            .filter(c => c.organizationId.length > 0)
            .map(c => ({
                erpId: c.erpId,
                name: c.name,
                organizationId: c.organizationId,
                organizationName: names.get(c.organizationId) ?? null,
                paymentKind: c.paymentKind,
                isMain: c.erpId === counterparty.mainContractId,
                isSelected: c.erpId === current?.erpId,
            }));
    }

    private async organizationNames(contracts: Contract[]): Promise<Map<string, string>> {
        const ids = [...new Set(contracts.map(c => c.organizationId).filter(Boolean))];
        if (ids.length === 0) return new Map();
        const rows: Array<{ erpId: string; legalName: string }> =
            await this.connection.rawConnection.query(
                `SELECT "erpId", "legalName" FROM organization_requisites WHERE "erpId" = ANY($1)`,
                [ids],
            );
        return new Map(rows.map(row => [row.erpId, row.legalName]));
    }

    private async counterpartyOf(ctx: RequestContext, order: Order): Promise<Counterparty> {
        const counterparty = order.customerId
            ? await this.counterpartyService.getForCustomer(ctx, order.customerId)
            : null;
        if (!counterparty) throw new UserInputError('The order customer has no counterparty');
        return counterparty;
    }

    // Order scope (own / branch / all) comes from the same query the order list uses.
    private async findVisibleOrder(ctx: RequestContext, orderId: ID): Promise<Order> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const order = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!order) throw new UserInputError('Order not found');
        return order;
    }
}
