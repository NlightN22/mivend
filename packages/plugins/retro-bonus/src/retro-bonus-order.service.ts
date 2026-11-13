import { Injectable } from '@nestjs/common';
import { ID, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { lineRetroBonus, type OrderRetroBonus } from './retro-bonus-line-percent';
import { RetroBonusRuleProduct } from './retro-bonus-rule-membership.entity';
import { RetroBonusRuleService } from './retro-bonus-rule.service';

const NONE: OrderRetroBonus = { hasRules: false, lines: [] };

// Display only: nothing here reads or changes an order price.
@Injectable()
export class RetroBonusOrderService {
    constructor(
        private connection: TransactionalConnection,
        private counterparties: CounterpartyService,
        private rules: RetroBonusRuleService,
    ) {}

    async forOrder(ctx: RequestContext, orderId: ID): Promise<OrderRetroBonus> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId },
            relations: ['lines', 'lines.productVariant', 'lines.productVariant.product'],
        });
        const counterpartyId = order?.customFields.counterpartyId;
        if (!order || !counterpartyId) return NONE;
        const counterparty = await this.counterparties.findOneVisible(ctx, counterpartyId);
        if (!counterparty) return NONE;
        const rules = await this.rules.findForCounterparty(ctx, counterparty.erpId);
        if (rules.length === 0) return NONE;
        // unbounded-ok: pricing path, a cap would change bonuses; bounded by active business data of the matched rules
        const rows = await this.connection
            .getRepository(ctx, RetroBonusRuleProduct)
            .find({ where: { ruleId: In(rules.map(r => r.id as number)) } });
        const members = new Map<number, Set<string>>();
        for (const row of rows) {
            members.set(row.ruleId, (members.get(row.ruleId) ?? new Set()).add(row.productErpId));
        }
        const now = new Date();
        const empty = new Set<string>();
        const lines = order.lines.flatMap(line => {
            const bonus = lineRetroBonus(
                rules,
                rule => members.get(rule.id as number) ?? empty,
                {
                    orderLineId: String(line.id),
                    productErpId:
                        (line.productVariant.product.customFields as { externalId?: string | null })
                            .externalId ?? '',
                    lineTotal: line.proratedLinePriceWithTax,
                },
                now,
            );
            return bonus ? [bonus] : [];
        });
        return { hasRules: true, lines };
    }
}
