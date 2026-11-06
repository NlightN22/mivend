import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigService, LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { CustomFieldConfig, RuntimeVendureConfig, Type } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';

import { ActingActiveOrderStrategy } from './acting-active-order.strategy';
import { ActingCartService } from './acting-cart.service';
import { ActingCheckoutLinkProcess } from './acting-checkout-link.process';
import { ActingEligibilityService } from './acting-eligibility.service';
import { ActingMutationLogInterceptor } from './acting-mutation-log.interceptor';
import { createActingSessionCleanupTask } from './acting-session-cleanup.scheduled-task';
import { ActingSessionLivenessService } from './acting-session-liveness.service';
import { ActingSessionMiddleware } from './acting-session.middleware';
import { ActingSessionService } from './acting-session.service';
import { ActingTicketService } from './acting-ticket.service';
import { ACTING_SESSION_PLUGIN_OPTIONS } from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';
import {
    ActingSessionAdminResolver,
    ActingSessionShopResolver,
} from './api/acting-session.resolver';
import { actingSessionAdminSchema, actingSessionShopSchema } from './api/acting-session.schema';
import { ActingTicket } from './entities/acting-ticket.entity';

const orderField = (config: { name: string }): CustomFieldConfig => ({
    ...config,
    type: 'string',
    nullable: true,
    public: false,
    label: [{ languageCode: LanguageCode.en, value: config.name }],
});

// Listed before OrderIdentityPlugin so its per-user lock wraps this strategy too.
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin, SessionManagementPlugin],
    entities: [ActingTicket],
    providers: [
        ActingSessionService,
        ActingEligibilityService,
        ActingTicketService,
        ActingSessionLivenessService,
        ActingCartService,
        ActingSessionMiddleware,
        { provide: 'APP_INTERCEPTOR', useClass: ActingMutationLogInterceptor },
        {
            provide: ACTING_SESSION_PLUGIN_OPTIONS,
            useFactory: (): ActingSessionPluginOptions => ActingSessionPlugin.options,
        },
    ],
    adminApiExtensions: {
        schema: actingSessionAdminSchema,
        resolvers: [ActingSessionAdminResolver],
    },
    shopApiExtensions: { schema: actingSessionShopSchema, resolvers: [ActingSessionShopResolver] },
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Order = [
            ...(config.customFields.Order ?? []),
            orderField({ name: 'actingSessionId' }),
            orderField({ name: 'actingAdministratorId' }),
        ];
        const strategies = config.orderOptions.activeOrderStrategy;
        config.orderOptions.activeOrderStrategy = Array.isArray(strategies)
            ? strategies.map(s => new ActingActiveOrderStrategy(s))
            : new ActingActiveOrderStrategy(strategies);
        config.orderOptions.process = [
            new ActingCheckoutLinkProcess(),
            ...(config.orderOptions.process ?? []),
        ];
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createActingSessionCleanupTask(ActingSessionPlugin.options),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class ActingSessionPlugin implements NestModule {
    static options: ActingSessionPluginOptions;

    static init(options: ActingSessionPluginOptions): Type<ActingSessionPlugin> {
        this.options = options;
        return ActingSessionPlugin;
    }

    constructor(private readonly configService: ConfigService) {}

    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(ActingSessionMiddleware)
            .forRoutes(this.configService.apiOptions.shopApiPath);
    }
}
