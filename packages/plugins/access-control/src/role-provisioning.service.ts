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

// Issue #134: on a fresh contour, neither the 6 manager-portal roles nor their RoleAccessScope
// rows exist until infrastructure/scripts/seed-access-roles.mjs is run by hand — confirmed live
// on staging-integration. RoleScopeConfigService.maxScopeFor then silently falls back to 'own'
// for everyone, with nothing indicating this is a config problem (see that service's own
// comment). This makes DEFAULT_ROLES the actual source of truth, applied idempotently at every
// real server boot.
//
// Runs against the DB directly via TransactionalConnection rather than RoleService.create/
// update — those methods gate on `activeUserHasPermissionsOnChannelsOf`, which requires an
// authenticated ctx.activeUserId and returns false for any Role, `own` (RequestContext.empty()
// has none) before any HTTP client can log in. Provisioning is system configuration applied
// before any request exists, not an administrator action, so it bypasses that user-privilege
// gate the same way `RoleService.initRoles()`'s own SuperAdmin/Customer role bootstrapping does
// internally.
//
// Gated on `!processContext.isWorker` (opposite of KafkaConsumerBootstrapService's own gate —
// see that file's comment) so this runs exactly once from the server process (apps/server/src/
// main.ts's bootstrap()), never duplicated from worker.ts/worker-email.ts's bootstrapWorker()
// which also load this plugin.
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

    // One role's failure must not stop the rest from provisioning — each iteration gets its own
    // error boundary instead of one try/catch around the whole loop, which previously aborted
    // provisioning of every role after the first one to throw.
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
