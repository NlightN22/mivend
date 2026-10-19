import { Injectable } from '@nestjs/common';
import {
    Administrator,
    NativeAuthenticationMethod,
    RequestContext,
    Role,
    TransactionalConnection,
    User,
} from '@vendure/core';
import { ctxQuery } from 'shared';
import type { SyncEventByType } from 'shared';

// Correlate by customFields.sourceAdministratorId; native Administrator.id differs per database.
// Runs inside ProductConsumer's transaction, so the idempotency check and apply commit atomically.
@Injectable()
export class AdministratorSyncService {
    constructor(private readonly connection: TransactionalConnection) {}

    async applyUpsert(
        ctx: RequestContext,
        event: SyncEventByType<'administrator.created'> | SyncEventByType<'administrator.updated'>,
    ): Promise<void> {
        const { payload } = event;
        const roles = await this.connection.getRepository(ctx, Role).find({
            where: payload.roleCodes.map(code => ({ code })),
        });

        const existing = await ctxQuery<Array<{ id: string; userId: string }>>(
            this.connection,
            ctx,
            `SELECT id, "userId" FROM administrator WHERE "customFieldsSourceadministratorid" = $1`,
            [payload.administratorId],
        );

        if (existing[0]) {
            const { id: adminId, userId } = existing[0];
            await this.connection.getRepository(ctx, Administrator).update(adminId, {
                firstName: payload.firstName,
                lastName: payload.lastName,
                emailAddress: payload.emailAddress,
                customFields: {
                    branchId: payload.branchId,
                    sourceAdministratorId: payload.administratorId,
                } as never,
            });

            const user = await this.connection
                .getRepository(ctx, User)
                .findOne({ where: { id: userId } });
            if (user) {
                user.identifier = payload.emailAddress;
                user.roles = roles;
                await this.connection.getRepository(ctx, User).save(user);
            }

            const native = await this.connection
                .getRepository(ctx, NativeAuthenticationMethod)
                .findOne({ where: { user: { id: userId } } });
            if (native) {
                native.identifier = payload.emailAddress;
                native.passwordHash = payload.passwordHash;
                await this.connection.getRepository(ctx, NativeAuthenticationMethod).save(native);
            }
            return;
        }

        const user = await this.connection.getRepository(ctx, User).save(
            this.connection.getRepository(ctx, User).create({
                identifier: payload.emailAddress,
                roles,
                verified: true,
            }),
        );
        await this.connection.getRepository(ctx, NativeAuthenticationMethod).save(
            this.connection.getRepository(ctx, NativeAuthenticationMethod).create({
                identifier: payload.emailAddress,
                passwordHash: payload.passwordHash,
                user,
            }),
        );
        await this.connection.getRepository(ctx, Administrator).save(
            this.connection.getRepository(ctx, Administrator).create({
                firstName: payload.firstName,
                lastName: payload.lastName,
                emailAddress: payload.emailAddress,
                user,
                customFields: {
                    branchId: payload.branchId,
                    sourceAdministratorId: payload.administratorId,
                } as never,
            }),
        );
    }

    async applyDeactivation(
        ctx: RequestContext,
        event: SyncEventByType<'administrator.deactivated'>,
    ): Promise<void> {
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            `UPDATE administrator SET "deletedAt" = NOW()
             WHERE "customFieldsSourceadministratorid" = $1 AND "deletedAt" IS NULL`,
            [event.payload.administratorId],
        );
    }
}
