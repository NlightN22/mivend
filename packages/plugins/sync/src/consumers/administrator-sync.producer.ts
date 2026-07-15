import { randomUUID } from 'crypto';

import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
    Administrator,
    AdministratorEvent,
    EventBus,
    NativeAuthenticationMethod,
} from '@vendure/core';

import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// Central is the master for Administrator identity — see docs/architecture.md's "User identity:
// Central is master, not federated". This listens to Vendure's own AdministratorEvent (fired on
// create/update/delete) and writes the replicated record — including the password hash, so a
// branch can authenticate a login fully offline — to sync_outbox for every branch. Central-only:
// AdministratorSyncService (branch-side, see product.consumer.ts's switch) is what actually
// applies these on a branch.
@Injectable()
export class AdministratorSyncProducer implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly syncService: SyncService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        this.eventBus.ofType(AdministratorEvent).subscribe(event => this.handle(event));
    }

    private async handle(event: AdministratorEvent): Promise<void> {
        if (event.type === 'deleted') {
            await this.dataSource.transaction(em =>
                this.syncService.writeToOutbox(
                    em,
                    {
                        eventId: randomUUID(),
                        eventType: 'administrator.deactivated',
                        payload: { administratorId: String(event.entity.id) },
                    },
                    'all-branches',
                ),
            );
            return;
        }

        const admin = await this.dataSource.getRepository(Administrator).findOne({
            where: { id: event.entity.id },
            relations: ['user', 'user.roles'],
        });
        if (!admin) return;

        // NativeAuthenticationMethod.passwordHash is declared `select: false` in Vendure core
        // (never returned by a normal find/relation load, for good reason) — must be fetched
        // explicitly via addSelect. Loading it through `admin.user.authenticationMethods`
        // instead would silently come back with passwordHash === undefined, which then
        // vanishes entirely on JSON serialization into the outbox row (not stored as null,
        // just absent) — this is exactly the bug that shipped here initially, caught by
        // SyncEventSchema rejecting the payload as missing a required field before publish.
        const native = await this.dataSource
            .getRepository(NativeAuthenticationMethod)
            .createQueryBuilder('nam')
            .addSelect('nam.passwordHash')
            .where('nam.userId = :userId', { userId: admin.user.id })
            .getOne();
        // No native (password) credentials to replicate — e.g. an SSO-only account. Nothing a
        // branch could authenticate against offline anyway, so there's nothing to sync.
        if (!native) return;

        const customFields = admin.customFields as { branchId?: string | null } | undefined;

        await this.dataSource.transaction(em =>
            this.syncService.writeToOutbox(
                em,
                {
                    eventId: randomUUID(),
                    eventType:
                        event.type === 'created'
                            ? 'administrator.created'
                            : 'administrator.updated',
                    payload: {
                        administratorId: String(admin.id),
                        emailAddress: admin.emailAddress,
                        firstName: admin.firstName,
                        lastName: admin.lastName,
                        roleCodes: admin.user.roles.map(r => r.code),
                        passwordHash: native.passwordHash,
                        branchId: customFields?.branchId ?? null,
                    },
                },
                'all-branches',
            ),
        );
    }
}
