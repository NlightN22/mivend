import { Injectable } from '@nestjs/common';
import {
    Channel,
    PaymentMethod,
    RequestContext,
    ShippingMethod,
    TaxCategory,
    TaxRate,
    TransactionalConnection,
    Zone,
} from '@vendure/core';
import { IsNull } from 'typeorm';

export interface SystemHealthCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail: string | null;
}

const DEFAULT_TAX_ZONE_DETAIL =
    'Zone, Tax Category and Tax Rate can all exist while this is still unset: set it under Settings > Channels.';

// Zone, TaxCategory and TaxRate can exist while Channel.defaultTaxZone is null, silently breaking
// tax calculation, so each item is checked independently. Runs under the caller's single permission
// gate instead of requiring Vendure's ReadSettings on business roles.
@Injectable()
export class SystemHealthService {
    constructor(private connection: TransactionalConnection) {}

    async checklist(ctx: RequestContext): Promise<SystemHealthCheckItem[]> {
        const [zones, taxCategories, taxRates, channel, shippingMethods, paymentMethods] =
            await Promise.all([
                this.connection.getRepository(ctx, Zone).count(),
                this.connection.getRepository(ctx, TaxCategory).count(),
                this.connection.getRepository(ctx, TaxRate).count(),
                this.connection
                    .getRepository(ctx, Channel)
                    .findOne({ where: { id: ctx.channelId }, relations: { defaultTaxZone: true } }),
                this.connection
                    .getRepository(ctx, ShippingMethod)
                    .count({ where: { deletedAt: IsNull(), channels: { id: ctx.channelId } } }),
                this.connection
                    .getRepository(ctx, PaymentMethod)
                    .count({ where: { enabled: true, channels: { id: ctx.channelId } } }),
            ]);
        const hasDefaultTaxZone = Boolean(channel?.defaultTaxZone);
        return [
            { id: 'zone', label: 'At least one Zone exists', ok: zones > 0, detail: null },
            {
                id: 'tax-category',
                label: 'At least one Tax Category exists',
                ok: taxCategories > 0,
                detail: null,
            },
            {
                id: 'tax-rate',
                label: 'At least one Tax Rate exists',
                ok: taxRates > 0,
                detail: null,
            },
            {
                id: 'default-tax-zone',
                label: 'Default tax zone is set on the active channel',
                ok: hasDefaultTaxZone,
                detail: hasDefaultTaxZone ? null : DEFAULT_TAX_ZONE_DETAIL,
            },
            {
                id: 'shipping-method',
                label: 'At least one Shipping Method exists',
                ok: shippingMethods > 0,
                detail: null,
            },
            {
                id: 'payment-method',
                label: 'At least one enabled Payment Method exists',
                ok: paymentMethods > 0,
                detail: null,
            },
        ];
    }
}
