import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import {
    Counterparty,
    CounterpartyService,
    TradingPointService,
} from '@mivend/plugin-counterparty';

export interface ActingTarget {
    counterpartyId: string;
    customerId: string;
    userId: string;
    tradingPointId: string | null;
}

// Same gate as manager order creation: an ERP-active counterparty with an activated, non-deleted portal customer.
@Injectable()
export class ActingEligibilityService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
        private tradingPoints: TradingPointService,
        private accessScope: AccessScopeService,
    ) {}

    async resolveForManager(
        ctx: RequestContext,
        counterpartyId: string,
        tradingPointId: string | null,
    ): Promise<ActingTarget> {
        const counterparty = await this.findCounterparty(ctx, counterpartyId);
        try {
            await this.accessScope.assertCounterpartyWritable(ctx, counterparty);
        } catch {
            throw new ForbiddenError();
        }
        return this.resolve(ctx, counterparty, tradingPointId);
    }

    async resolveByIds(
        ctx: RequestContext,
        counterpartyId: string,
        tradingPointId: string | null,
    ): Promise<ActingTarget> {
        return this.resolve(ctx, await this.findCounterparty(ctx, counterpartyId), tradingPointId);
    }

    private async resolve(
        ctx: RequestContext,
        counterparty: Counterparty,
        tradingPointId: string | null,
    ): Promise<ActingTarget> {
        if (!counterparty.isActive) {
            throw new UserInputError('The counterparty is inactive in the ERP');
        }
        const linkedId = await this.counterpartyService.getLinkedCustomerId(ctx, counterparty.id);
        const customer = linkedId
            ? await this.customerService.findOne(ctx, linkedId, ['user'])
            : undefined;
        if (!customer?.user) {
            throw new UserInputError('The counterparty has no activated portal access');
        }
        if (tradingPointId)
            await this.assertPointBelongs(ctx, String(counterparty.id), tradingPointId);
        return {
            counterpartyId: String(counterparty.id),
            customerId: String(customer.id),
            userId: String(customer.user.id),
            tradingPointId,
        };
    }

    private async assertPointBelongs(
        ctx: RequestContext,
        counterpartyId: string,
        tradingPointId: string,
    ): Promise<void> {
        const point = await this.tradingPoints.findById(ctx, tradingPointId);
        if (
            !point ||
            String(point.counterpartyId) !== String(counterpartyId) ||
            !point.isActive ||
            point.customerStatus !== 'active'
        ) {
            throw new UserInputError("The trading point is not one of the counterparty's points");
        }
    }

    private async findCounterparty(ctx: RequestContext, id: string): Promise<Counterparty> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id } });
        if (!counterparty) throw new UserInputError('Counterparty not found');
        return counterparty;
    }
}
