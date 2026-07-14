import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    LanguageCode,
    LoginEvent,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';

import { SessionManagementResolver } from './api/session-management.resolver';
import { sessionManagementSchema } from './api/session-management.schema';
import { SessionLoginListenerService } from './session-login-listener.service';
import { SessionManagementService } from './session-management.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [SessionManagementService, SessionLoginListenerService],
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
    constructor(
        private readonly eventBus: EventBus,
        private readonly loginListenerService: SessionLoginListenerService,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus.ofType(LoginEvent).subscribe(event => {
            void this.loginListenerService.tagLatestSessionWithUserAgent(event.ctx, event.user);
        });
    }
}
