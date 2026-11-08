import { Injectable } from '@nestjs/common';
import { ForbiddenError, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { ActingContextService } from './acting-context.service';

export interface SignInSettings {
    newDeviceEmail: boolean;
}

@Injectable()
export class SignInSettingsService {
    constructor(
        private connection: TransactionalConnection,
        private acting: ActingContextService,
    ) {}

    async get(ctx: RequestContext): Promise<SignInSettings> {
        const rows = await ctxQuery<Array<{ enabled: boolean }>>(
            this.connection,
            ctx,
            'SELECT "customFieldsNewdeviceemailenabled" AS enabled FROM "user" WHERE id = $1',
            [ctx.activeUserId],
        );
        return { newDeviceEmail: rows[0]?.enabled !== false };
    }

    async setNewDeviceEmail(ctx: RequestContext, enabled: boolean): Promise<SignInSettings> {
        if (await this.acting.get(ctx)) {
            throw new ForbiddenError();
        }
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            'UPDATE "user" SET "customFieldsNewdeviceemailenabled" = $2 WHERE id = $1',
            [ctx.activeUserId, enabled],
        );
        return { newDeviceEmail: enabled };
    }
}
