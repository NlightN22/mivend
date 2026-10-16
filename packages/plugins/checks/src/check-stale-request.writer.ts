import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'node:crypto';

export const CHECK_CODE_KIND = 'check-code';

@Injectable()
export class CheckStaleRequestWriter {
    constructor(private connection: TransactionalConnection) {}

    async request(ctx: RequestContext, kind: string, key: string): Promise<void> {
        await this.connection.getRepository(ctx, 'Channel').query(
            `INSERT INTO check_stale_request ("uuid", "kind", "key") VALUES ($1, $2, $3)
             ON CONFLICT ("kind", "key") DO UPDATE SET "version" = check_stale_request."version" + 1,
                                                       "updatedAt" = now()`,
            [randomUUID(), kind, key],
        );
    }
}
