import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    ChannelService,
    CurrencyCode,
    Logger,
    ProcessContext,
    RequestContext,
} from '@vendure/core';

import { ACCESS_CONTROL_PLUGIN_OPTIONS, AccessControlPluginOptions, loggerCtx } from './types';

// Vendure creates the default channel with USD; ChannelService.update also re-currencies its
// ProductVariantPrice rows, so a fresh contour needs no manual step to price in the configured one.
@Injectable()
export class DefaultChannelCurrencyBootstrapService implements OnApplicationBootstrap {
    constructor(
        private channelService: ChannelService,
        private processContext: ProcessContext,
        @Inject(ACCESS_CONTROL_PLUGIN_OPTIONS) private options: AccessControlPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const currency = this.options.defaultCurrencyCode;
        if (this.processContext.isWorker || !currency) return;
        try {
            const channel = await this.channelService.getDefaultChannel();
            if (channel.defaultCurrencyCode === currency) return;
            await this.channelService.update(RequestContext.empty(), {
                id: channel.id,
                defaultCurrencyCode: currency as CurrencyCode,
                availableCurrencyCodes: [currency as CurrencyCode],
            });
            Logger.info(
                `Default channel currency ${channel.defaultCurrencyCode} -> ${currency}`,
                loggerCtx,
            );
        } catch (err) {
            Logger.error(
                `Default channel currency bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
                loggerCtx,
            );
        }
    }
}
