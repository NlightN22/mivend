import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    ChannelService,
    Logger,
    Permission,
    ProcessContext,
    RequestContext,
    Role,
    TransactionalConnection,
} from '@vendure/core';

import { DEFAULT_ROLES, DefaultRoleDefinition } from './default-roles';
import { RoleScopeConfigService } from './role-scope-config.service';
import { loggerCtx } from './types';

// Create-only: an existing role or scope row is never touched, so edits made in the admin UI survive.
// Direct DB writes (RoleService needs an authenticated user, absent at boot); server process only.
@Injectable()
export class RoleProvisioningService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private roleScopeConfigService: RoleScopeConfigService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;

        const ctx = RequestContext.empty();
        for (const definition of DEFAULT_ROLES) {
            await this.provisionRoleSafely(ctx, definition);
        }
    }

    // Per-role error boundary: one role throwing must not abort provisioning of the rest.
    private async provisionRoleSafely(
        ctx: RequestContext,
        definition: DefaultRoleDefinition,
    ): Promise<void> {
        try {
            await this.provisionRole(ctx, definition);
        } catch (err) {
            Logger.error(
                `Failed to self-provision role "${definition.code}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async provisionRole(
        ctx: RequestContext,
        definition: DefaultRoleDefinition,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Role);
        const role = await repo.findOne({ where: { code: definition.code } });
        const permissions = [Permission.Authenticated, ...definition.permissions] as Permission[];

        if (!role) {
            const defaultChannel = await this.channelService.getDefaultChannel(ctx);
            await repo.save(
                repo.create({
                    code: definition.code,
                    description: definition.description,
                    permissions,
                    channels: [defaultChannel],
                }),
            );
            Logger.info(`Provisioned role "${definition.code}"`, loggerCtx);
        }

        await this.roleScopeConfigService.createScopeIfMissing(
            ctx,
            definition.code,
            definition.accessScopeConfig,
        );
    }
}
