import { PluginCommonModule, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';

import { Notification } from './entities/notification.entity';
import { NotificationRetentionRule } from './entities/notification-retention-rule.entity';
import { NotificationRetentionRuleService } from './notification-retention-rule.service';
import { NotificationRetentionRuleAdminResolver } from './notification-retention-rule.resolver';
import { NotificationService } from './notification.service';
import { ClientNotificationService } from './client-notification.service';
import { createNotificationCleanupTask } from './notification-cleanup.scheduled-task';
import { NotificationRetentionService } from './notification-retention.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { NotificationAdminResolver } from './notification-admin.resolver';
import { NotificationShopResolver } from './notification-shop.resolver';
import { NOTIFICATION_PUB_SUB, createNotificationPubSub } from './notification-pub-sub';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';

// This plugin owns only storage, the upsert-by-source rule, and the Admin/Shop API surface.
// Producers calling NotificationService.create come in follow-up work; none exist yet.
@VendurePlugin({
    imports: [PluginCommonModule, ErpOrderPlugin, SessionManagementPlugin],
    entities: [Notification, NotificationRetentionRule],
    providers: [
        NotificationService,
        NotificationRecipientService,
        NotificationRetentionService,
        NotificationRetentionRuleService,
        ClientNotificationService,
        {
            provide: NOTIFICATION_PUB_SUB,
            useFactory: createNotificationPubSub,
        },
    ],
    exports: [NotificationService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [NotificationAdminResolver, NotificationRetentionRuleAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [NotificationShopResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createNotificationCleanupTask(),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class NotificationPlugin {}
