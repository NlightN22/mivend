import { Injectable, Logger } from '@nestjs/common';
import { ChannelService, RequestContext, TransactionalConnection, Zone } from '@vendure/core';

import { DEFAULT_TAX_ZONE_NAME, loggerCtx } from './types';

// Issue #141: find-or-create for the single default tax Zone. Zone has no natural external-id
// field in Vendure core, so this keys by name — the only stable, human-visible handle it offers.
// Shared by the product-side auto-create path and VatRateStreamHandler.
@Injectable()
export class TaxZoneService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly channelService: ChannelService,
    ) {}

    async findOrCreateDefaultZone(ctx: RequestContext): Promise<Zone> {
        const repo = this.connection.getRepository(ctx, Zone);
        const zone =
            (await repo.findOne({ where: { name: DEFAULT_TAX_ZONE_NAME } })) ??
            (await repo.save(repo.create({ name: DEFAULT_TAX_ZONE_NAME })));
        await this.ensureChannelDefaults(ctx, zone);
        return zone;
    }

    // Bootstrap repair for a contour whose zone predates #144 (no-op when nothing is missing).
    async ensureChannelDefaultsForExistingZone(ctx: RequestContext): Promise<void> {
        const zone = await this.connection
            .getRepository(ctx, Zone)
            .findOne({ where: { name: DEFAULT_TAX_ZONE_NAME } });
        if (zone) await this.ensureChannelDefaults(ctx, zone);
    }

    // #144: a variant can't be priced without the channel's default tax zone; never overrides one.
    private async ensureChannelDefaults(ctx: RequestContext, zone: Zone): Promise<void> {
        const channel = await this.channelService.getDefaultChannel(ctx);
        const missingTax = !channel.defaultTaxZone;
        const missingShipping = !channel.defaultShippingZone;
        if (!missingTax && !missingShipping) return;
        await this.channelService.update(ctx, {
            id: channel.id,
            ...(missingTax ? { defaultTaxZoneId: zone.id } : {}),
            ...(missingShipping ? { defaultShippingZoneId: zone.id } : {}),
        });
        Logger.log(`Set default channel's missing default zone(s) to '${zone.name}'`, loggerCtx);
    }
}
