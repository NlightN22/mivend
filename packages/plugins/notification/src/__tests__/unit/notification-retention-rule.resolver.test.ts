import { describe, expect, it } from 'vitest';
import { Permission, PERMISSIONS_METADATA_KEY } from '@vendure/core';

import { NotificationRetentionRuleAdminResolver } from '../../notification-retention-rule.resolver';

const proto = NotificationRetentionRuleAdminResolver.prototype;

describe('NotificationRetentionRuleAdminResolver permission gates', () => {
    it('reads are gated by exactly ReadSettings', () => {
        expect(
            Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto.notificationRetentionRules),
        ).toEqual([Permission.ReadSettings]);
    });

    it('updates are gated by exactly UpdateSettings', () => {
        expect(
            Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto.updateNotificationRetentionRule),
        ).toEqual([Permission.UpdateSettings]);
    });
});
