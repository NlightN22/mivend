import { Injectable } from '@nestjs/common';
import { EventBus, RequestContext, User, VendureEvent } from '@vendure/core';
import { VersioningService } from '@mivend/plugin-versioning';
import type { EntityVersionAction } from '@mivend/plugin-versioning';

export const AUDIT_ENTITY = 'TwoFactor';

export type TwoFactorAuditEvent =
    | 'enrolled'
    | 'changed'
    | 'recovery-requested'
    | 'recovery-completed'
    | 'reset';

const ACTIONS: Record<TwoFactorAuditEvent, EntityVersionAction> = {
    enrolled: 'create',
    changed: 'update',
    'recovery-requested': 'update',
    'recovery-completed': 'deactivate',
    reset: 'deactivate',
};

@Injectable()
export class TwoFactorAuditService {
    constructor(
        private versioning: VersioningService,
        private eventBus: EventBus,
    ) {}

    async record(ctx: RequestContext, userId: string, event: TwoFactorAuditEvent): Promise<void> {
        await this.versioning.recordChange(ctx, {
            entityName: AUDIT_ENTITY,
            entityId: userId,
            action: ACTIONS[event],
            comment: `two-factor ${event}`,
        });
    }

    async recordAndNotify(
        ctx: RequestContext,
        user: User,
        event: TwoFactorAuditEvent,
        notification: VendureEvent,
    ): Promise<void> {
        await this.record(ctx, String(user.id), event);
        await this.eventBus.publish(notification);
    }
}
