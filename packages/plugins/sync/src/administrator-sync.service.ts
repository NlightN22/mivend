import { Injectable } from '@nestjs/common';
import { Administrator, NativeAuthenticationMethod, Role, User } from '@vendure/core';
import { EntityManager } from 'typeorm';
import type { SyncEventByType } from 'shared';

// Branch-side apply logic for the Central-is-master Administrator replica — see
// docs/architecture.md's "User identity: Central is master, not federated" and
// AdministratorSyncProducer (the Central-side counterpart). Applied from within
// ProductConsumer's switch (the sole RabbitMQ subscriber for a branch's queue — see
// product.consumer.ts), inside the same transaction as its idempotency check.
//
// Correlation key: `Administrator.customFields.sourceAdministratorId` — NOT the native
// auto-increment `Administrator.id`, which is per-instance and meaningless across databases
// (see AGENTS.md's ID-coercion gotcha). Looked up via raw SQL against the flattened customFields
// column, matching this codebase's established convention (see TradingPointService) rather than
// TypeORM's embedded-object `where` syntax, which has no precedent here.
@Injectable()
export class AdministratorSyncService {
    async applyUpsert(
        em: EntityManager,
        event: SyncEventByType<'administrator.created'> | SyncEventByType<'administrator.updated'>,
    ): Promise<void> {
        const { payload } = event;
        const roles = await em.getRepository(Role).find({
            where: payload.roleCodes.map(code => ({ code })),
        });

        const existing: Array<{ id: string; userId: string }> = await em.query(
            `SELECT id, "userId" FROM administrator WHERE "customFieldsSourceadministratorid" = $1`,
            [payload.administratorId],
        );

        if (existing[0]) {
            const { id: adminId, userId } = existing[0];
            await em.getRepository(Administrator).update(adminId, {
                firstName: payload.firstName,
                lastName: payload.lastName,
                emailAddress: payload.emailAddress,
                customFields: {
                    branchId: payload.branchId,
                    sourceAdministratorId: payload.administratorId,
                } as never,
            });

            const user = await em.getRepository(User).findOne({ where: { id: userId } });
            if (user) {
                user.identifier = payload.emailAddress;
                user.roles = roles;
                await em.getRepository(User).save(user);
            }

            const native = await em
                .getRepository(NativeAuthenticationMethod)
                .findOne({ where: { user: { id: userId } } });
            if (native) {
                native.identifier = payload.emailAddress;
                native.passwordHash = payload.passwordHash;
                await em.getRepository(NativeAuthenticationMethod).save(native);
            }
            return;
        }

        const user = await em.getRepository(User).save(
            em.getRepository(User).create({
                identifier: payload.emailAddress,
                roles,
                verified: true,
            }),
        );
        await em.getRepository(NativeAuthenticationMethod).save(
            em.getRepository(NativeAuthenticationMethod).create({
                identifier: payload.emailAddress,
                passwordHash: payload.passwordHash,
                user,
            }),
        );
        await em.getRepository(Administrator).save(
            em.getRepository(Administrator).create({
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
        em: EntityManager,
        event: SyncEventByType<'administrator.deactivated'>,
    ): Promise<void> {
        await em.query(
            `UPDATE administrator SET "deletedAt" = NOW()
             WHERE "customFieldsSourceadministratorid" = $1 AND "deletedAt" IS NULL`,
            [event.payload.administratorId],
        );
    }
}
