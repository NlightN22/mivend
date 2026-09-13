import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { NotificationAdminResolver } from './notification-admin.resolver';
import { NotificationShopResolver } from './notification-shop.resolver';
import { NOTIFICATION_PUB_SUB, createNotificationPubSub } from './notification-pub-sub';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';

// Unified notification system (issue #87, Part 1) — this plugin only owns storage, the
// upsert-by-source rule, and the Admin/Shop API surface. Producers (reservation, acquiring,
// erp-integration, etc. calling NotificationService.create) are separate follow-up work, per the
// issue's own phasing.
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Notification],
    providers: [
        NotificationService,
        NotificationRecipientService,
        {
            provide: NOTIFICATION_PUB_SUB,
            useFactory: createNotificationPubSub,
        },
    ],
    exports: [NotificationService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [NotificationAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [NotificationShopResolver],
    },
    compatibility: '>0.0.0',
})
export class NotificationPlugin {}
