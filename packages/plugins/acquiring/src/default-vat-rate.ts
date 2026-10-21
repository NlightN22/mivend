import { RequestContext, TaxRate, TransactionalConnection } from '@vendure/core';
import { isUnconfirmedTaxRateName } from 'shared';

export interface DefaultVatRate {
    taxRate: number | null;
    taxCategoryName: string;
}

// The default TaxCategory's enabled rate in the channel's default zone; an ERP placeholder rate is unconfirmed (null).
export async function findDefaultVatRate(
    connection: TransactionalConnection,
    ctx: RequestContext,
): Promise<DefaultVatRate | null> {
    const zoneId = ctx.channel.defaultTaxZone?.id;
    if (!zoneId) return null;
    const rate = await connection.getRepository(ctx, TaxRate).findOne({
        where: { enabled: true, zone: { id: zoneId }, category: { isDefault: true } },
        relations: ['category'],
    });
    if (!rate) return null;
    return {
        taxRate: isUnconfirmedTaxRateName(rate.name) ? null : Number(rate.value),
        taxCategoryName: rate.category.name,
    };
}
