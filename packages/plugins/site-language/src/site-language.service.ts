import { Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
    EventBus,
    GlobalSettingsEvent,
    GlobalSettingsService,
    Logger,
    RequestContext,
} from '@vendure/core';
import { subscribeAndLog } from 'shared';

import { asSiteLanguage, siteLanguageSnapshot } from './types';
import type { SiteLanguage } from './types';

const TTL_MS = 60_000;

@Injectable()
export class SiteLanguageService implements OnApplicationBootstrap, OnApplicationShutdown {
    private loadedAt = 0;
    private timer?: NodeJS.Timeout;

    constructor(
        private globalSettings: GlobalSettingsService,
        private eventBus: EventBus,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.refreshLogged();
        subscribeAndLog(
            this.eventBus,
            GlobalSettingsEvent,
            () => this.refresh(),
            'SiteLanguagePlugin',
        );
        this.timer = setInterval(() => void this.refreshLogged(), TTL_MS);
        this.timer.unref();
    }

    onApplicationShutdown(): void {
        clearInterval(this.timer);
    }

    async getDefault(): Promise<SiteLanguage | undefined> {
        if (Date.now() - this.loadedAt > TTL_MS) await this.refresh();
        return siteLanguageSnapshot.value;
    }

    private refreshLogged(): Promise<void> {
        return this.refresh().catch((err: unknown) =>
            Logger.error(`Default language refresh failed: ${String(err)}`, 'SiteLanguagePlugin'),
        );
    }

    private async refresh(): Promise<void> {
        const settings = await this.globalSettings.getSettings(RequestContext.empty());
        siteLanguageSnapshot.value = asSiteLanguage(settings.customFields.defaultLanguage);
        this.loadedAt = Date.now();
    }
}
