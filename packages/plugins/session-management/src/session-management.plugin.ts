import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    LanguageCode,
    LoginEvent,
    PluginCommonModule,
    RuntimeVendureConfig,
    Type,
    VendurePlugin,
} from '@vendure/core';
import { subscribeAndLog } from 'shared';

import { SessionManagementResolver } from './api/session-management.resolver';
import { sessionManagementSchema } from './api/session-management.schema';
import { SessionCleanupWorker } from './session-cleanup.worker';
import { SessionLoginListenerService } from './session-login-listener.service';
import { SessionManagementService } from './session-management.service';
import { SESSION_MANAGEMENT_PLUGIN_OPTIONS } from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        SessionManagementService,
        SessionLoginListenerService,
        SessionCleanupWorker,
        {
            provide: SESSION_MANAGEMENT_PLUGIN_OPTIONS,
            useFactory: (): SessionManagementPluginOptions => SessionManagementPlugin.options,
        },
    ],
    exports: [SessionManagementService],
    shopApiExtensions: {
        schema: sessionManagementSchema,
        resolvers: [SessionManagementResolver],
    },
    adminApiExtensions: {
        schema: sessionManagementSchema,
        resolvers: [SessionManagementResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Session = [
            ...(config.customFields.Session ?? []),
            {
                name: 'userAgent',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'User agent' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class SessionManagementPlugin implements OnApplicationBootstrap {
    static options: SessionManagementPluginOptions;

    static init(options: SessionManagementPluginOptions): Type<SessionManagementPlugin> {
        this.options = options;
        return SessionManagementPlugin;
    }

    constructor(
        private readonly eventBus: EventBus,
        private readonly loginListenerService: SessionLoginListenerService,
    ) {}

    onApplicationBootstrap(): void {
        subscribeAndLog(
            this.eventBus,
            LoginEvent,
            event => this.loginListenerService.tagLatestSessionWithUserAgent(event.ctx, event.user),
            'SessionManagementPlugin',
        );
    }
}
