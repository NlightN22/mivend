import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, ID } from '@vendure/core';
import { DataSource } from 'typeorm';

import { MAX_ACTIVE_SESSIONS_DEFAULT, SESSION_MANAGEMENT_PLUGIN_OPTIONS } from './session.types';
import type { SessionManagementPluginOptions } from './session.types';

@Injectable()
export class SessionCapService {
    constructor(
        @Inject(SESSION_MANAGEMENT_PLUGIN_OPTIONS)
        private options: SessionManagementPluginOptions,
        private configService: ConfigService,
        private dataSource: DataSource,
    ) {}

    // Invalidates the user's oldest active sessions beyond the cap; returns how many were ended.
    async enforceCap(userId: ID): Promise<number> {
        const cap = this.options.maxActiveSessionsPerUser ?? MAX_ACTIVE_SESSIONS_DEFAULT;
        const tokens = await this.dataSource.transaction(async manager => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                `session-cap:${userId}`,
            ]);
            const rows: { token: string }[] = await manager.query(
                `WITH ended AS (
                    UPDATE session SET invalidated = true WHERE id IN (
                        SELECT id FROM session
                        WHERE "userId" = $1 AND type = 'AuthenticatedSession'
                            AND invalidated = false AND expires > $2
                        ORDER BY "createdAt" DESC, id DESC
                        OFFSET $3
                    ) RETURNING token
                ) SELECT token FROM ended`,
                [userId, new Date(), cap],
            );
            return rows.map(row => row.token);
        });
        for (const token of tokens) {
            await this.configService.authOptions.sessionCacheStrategy.delete(token);
        }
        return tokens.length;
    }
}
