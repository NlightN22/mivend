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

// Direct DB writes: RoleService.create/update require an authenticated active user, absent at boot.
// Server process only (!isWorker); on fresh contours missing roles silently fall back to 'own'.
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
        let role = await repo.findOne({ where: { code: definition.code } });
        const permissions = [Permission.Authenticated, ...definition.permissions] as Permission[];

        if (!role) {
            const defaultChannel = await this.channelService.getDefaultChannel(ctx);
            role = repo.create({
                code: definition.code,
                description: definition.description,
                permissions,
                channels: [defaultChannel],
            });
            await repo.save(role);
            Logger.info(`Provisioned role "${definition.code}"`, loggerCtx);
        } else if (!permissionsMatch(role.permissions, permissions)) {
            role.permissions = permissions;
            role.description = definition.description;
            await repo.save(role);
            Logger.info(`Updated permissions for role "${definition.code}"`, loggerCtx);
        }

        await this.roleScopeConfigService.setScopeFor(
            ctx,
            definition.code,
            definition.accessScopeConfig,
        );
    }
}

function permissionsMatch(a: Permission[], b: Permission[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
}
