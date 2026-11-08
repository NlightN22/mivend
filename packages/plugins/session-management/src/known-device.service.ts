import { Injectable } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection, User } from '@vendure/core';
import { ctxQuery } from 'shared';

import { KNOWN_DEVICES_PER_USER_MAX, NEW_DEVICE_MAIL_MIN_INTERVAL } from './session.types';
import { deviceIdentityFor } from './device-identity';
import { NewDeviceSignInEvent } from './new-device-sign-in.event';

@Injectable()
export class KnownDeviceService {
    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
    ) {}

    // The first device an account ever signs in from is registered silently; later unknown ones notify the owner.
    async recordSignIn(
        ctx: RequestContext,
        user: User,
        signInCtx: RequestContext,
    ): Promise<boolean> {
        const identity = deviceIdentityFor(signInCtx.req);
        const userId = String(user.id);
        const shouldNotify = await this.connection.withTransaction(ctx, async txCtx => {
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                'SELECT pg_advisory_xact_lock(hashtext($1))',
                [`known-device:${userId}`],
            );
            const [{ count }] = await ctxQuery<Array<{ count: string }>>(
                this.connection,
                txCtx,
                'SELECT count(*) AS count FROM known_device WHERE "userId" = $1',
                [userId],
            );
            const inserted = await ctxQuery<unknown[]>(
                this.connection,
                txCtx,
                `INSERT INTO known_device ("uuid", "userId", "deviceHash", label, "lastSeenAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, now())
                 ON CONFLICT ("userId", "deviceHash") DO UPDATE SET "lastSeenAt" = now(), label = $3
                 RETURNING (xmax = 0) AS inserted`,
                [userId, identity.hash, identity.label],
            );
            const isNew = Number(count) > 0 && (inserted[0] as { inserted: boolean }).inserted;
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `DELETE FROM known_device WHERE "userId" = $1 AND id NOT IN (
                    SELECT id FROM known_device WHERE "userId" = $1
                    ORDER BY "lastSeenAt" DESC, id DESC LIMIT $2)`,
                [userId, KNOWN_DEVICES_PER_USER_MAX],
            );
            if (!isNew) return false;
            const [{ recent }] = await ctxQuery<Array<{ recent: string }>>(
                this.connection,
                txCtx,
                `SELECT count(*) AS recent FROM known_device
                 WHERE "userId" = $1 AND "deviceHash" <> $2
                   AND "createdAt" > now() - interval '${NEW_DEVICE_MAIL_MIN_INTERVAL}'`,
                [userId, identity.hash],
            );
            return Number(recent) === 0;
        });
        if (!shouldNotify || !(await this.emailEnabled(ctx, userId))) {
            return false;
        }
        await this.eventBus.publish(
            new NewDeviceSignInEvent(signInCtx, user, identity.label, new Date()),
        );
        return true;
    }

    private async emailEnabled(ctx: RequestContext, userId: string): Promise<boolean> {
        const rows = await ctxQuery<Array<{ enabled: boolean }>>(
            this.connection,
            ctx,
            'SELECT "customFieldsNewdeviceemailenabled" AS enabled FROM "user" WHERE id = $1',
            [userId],
        );
        return rows[0]?.enabled !== false;
    }
}
