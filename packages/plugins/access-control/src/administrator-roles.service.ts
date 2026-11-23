import { Injectable } from '@nestjs/common';
import { SUPER_ADMIN_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import {
    Administrator,
    AdministratorEvent,
    EventBus,
    ForbiddenError,
    RequestContext,
    Role,
    RoleChangeEvent,
    TransactionalConnection,
    User,
    UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';

import { DEFAULT_ROLES } from './default-roles';

const ASSIGNABLE_CODES: string[] = DEFAULT_ROLES.map(r => r.code).filter(
    code => code !== SUPER_ADMIN_ROLE_CODE,
);

// Not Vendure's role grant guard: the actor needs no right held by the assigned role, only the
// lifecycle right on the mutation. The scope is the guard, so it stays narrow and explicit.
@Injectable()
export class AdministratorRolesService {
    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
    ) {}

    async assignableRoles(ctx: RequestContext): Promise<Role[]> {
        return this.connection
            .getRepository(ctx, Role)
            .find({ where: { code: In(ASSIGNABLE_CODES) }, take: ASSIGNABLE_CODES.length });
    }

    async setRoles(
        ctx: RequestContext,
        administratorId: string,
        roleIds: string[],
    ): Promise<Administrator> {
        const ids = [...new Set(roleIds.map(String))];
        if (ids.length === 0) throw new UserInputError('error.administrator-roles-required');
        if (ids.length > ASSIGNABLE_CODES.length) {
            throw new UserInputError('error.administrator-role-not-assignable');
        }
        const roles = await this.assignableRoles(ctx);
        const allowed = new Set(roles.map(r => String(r.id)));
        if (ids.some(id => !allowed.has(id))) {
            throw new UserInputError('error.administrator-role-not-assignable');
        }
        return this.connection.withTransaction(ctx, async txCtx => {
            // Row lock first, read under it: two concurrent changes serialize instead of mixing.
            const repo = this.connection.getRepository(txCtx, Administrator);
            const admin = await repo.findOne({
                where: { id: administratorId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!admin) throw new UserInputError('error.administrator-not-found');
            const full = await repo.findOneOrFail({
                where: { id: administratorId },
                relations: ['user', 'user.roles'],
            });
            if (String(full.user.id) === String(txCtx.activeUserId)) {
                throw new ForbiddenError();
            }
            if (full.user.roles.some(r => r.code === SUPER_ADMIN_ROLE_CODE)) {
                throw new ForbiddenError();
            }
            if (full.user.roles.some(r => !ASSIGNABLE_CODES.includes(r.code))) {
                throw new UserInputError('error.administrator-role-not-assignable');
            }
            const before = full.user.roles.map(r => String(r.id));
            full.user.roles = roles.filter(r => ids.includes(String(r.id)));
            await this.connection.getRepository(txCtx, User).save(full.user);
            const added = ids.filter(id => !before.includes(id));
            const removed = before.filter(id => !ids.includes(id));
            // The sync producer listens to AdministratorEvent; core publishes both on a role change.
            if (added.length) {
                await this.eventBus.publish(new RoleChangeEvent(txCtx, full, added, 'assigned'));
            }
            if (removed.length) {
                await this.eventBus.publish(new RoleChangeEvent(txCtx, full, removed, 'removed'));
            }
            await this.eventBus.publish(
                new AdministratorEvent(txCtx, full, 'updated', {
                    id: administratorId,
                    roleIds: ids,
                }),
            );
            return full;
        });
    }
}
