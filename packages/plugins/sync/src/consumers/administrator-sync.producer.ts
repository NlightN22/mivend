import { randomUUID } from 'crypto';

import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    Administrator,
    AdministratorEvent,
    EventBus,
    NativeAuthenticationMethod,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';

import { registerOutboxProducer } from '../producer-registry';
import type { OutboxEntry } from '../producer-registry';
import { SyncService } from '../sync.service';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// Central is the master for Administrator identity (not federated); this runs on Central only.
// The password hash is included so a branch can authenticate logins fully offline.
@Injectable()
export class AdministratorSyncProducer implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
        private readonly syncService: SyncService,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;
        const deps = {
            eventBus: this.eventBus,
            connection: this.connection,
            requestContextService: this.requestContextService,
            syncService: this.syncService,
        };

        registerOutboxProducer(deps, AdministratorEvent, (ctx, event) =>
            this.toOutboxEntry(ctx, event),
        );
    }

    private async toOutboxEntry(
        ctx: RequestContext,
        event: AdministratorEvent,
    ): Promise<OutboxEntry | null> {
        if (event.type === 'deleted') {
            return {
                eventId: randomUUID(),
                eventType: 'administrator.deactivated',
                payload: { administratorId: String(event.entity.id) },
                target: 'all-branches',
            };
        }

        const admin = await this.connection.getRepository(ctx, Administrator).findOne({
            where: { id: event.entity.id },
            relations: ['user', 'user.roles'],
        });
        if (!admin) return null;

        // passwordHash is select:false in Vendure core; it must be fetched with addSelect.
        // Other loads leave it undefined, and JSON.stringify silently drops it from the outbox payload.
        const native = await this.connection
            .getRepository(ctx, NativeAuthenticationMethod)
            .createQueryBuilder('nam')
            .addSelect('nam.passwordHash')
            .where('nam.userId = :userId', { userId: admin.user.id })
            .getOne();
        // No native (password) credentials to replicate — e.g. an SSO-only account. Nothing a
        // branch could authenticate against offline anyway, so there's nothing to sync.
        if (!native) return null;

        const customFields = admin.customFields as { branchId?: string | null } | undefined;

        return {
            eventId: randomUUID(),
            eventType: event.type === 'created' ? 'administrator.created' : 'administrator.updated',
            payload: {
                administratorId: String(admin.id),
                emailAddress: admin.emailAddress,
                firstName: admin.firstName,
                lastName: admin.lastName,
                roleCodes: admin.user.roles.map(r => r.code),
                passwordHash: native.passwordHash,
                branchId: customFields?.branchId ?? null,
            },
            target: 'all-branches',
        };
    }
}
