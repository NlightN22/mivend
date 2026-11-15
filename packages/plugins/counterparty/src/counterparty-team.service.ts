import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Logger, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { findBounded } from 'shared';
import { QueryFailedError } from 'typeorm';

import { Counterparty } from './entities/counterparty.entity';
import {
    CounterpartyTeamMember,
    CounterpartyTeamMemberRole,
} from './entities/counterparty-team-member.entity';
import { CounterpartyVersionService } from './counterparty-version.service';
import { loggerCtx } from './types';

@Injectable()
export class CounterpartyTeamService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
        private versions: CounterpartyVersionService,
    ) {}

    async getTeamMembers(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<CounterpartyTeamMember[]> {
        return findBounded(this.connection.getRepository(ctx, CounterpartyTeamMember), {
            where: { counterpartyId: String(counterpartyId) },
            order: { createdAt: 'ASC' },
        });
    }

    // Gated by CustomPermission.ManageCounterpartyTeam at the resolver, plus the shared
    // assertCounterpartyWritable row check.
    async addTeamMember(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
        role: CounterpartyTeamMemberRole,
        phone?: string | null,
    ): Promise<CounterpartyTeamMember> {
        if (role !== 'backup' && role !== 'observer' && role !== 'accounting-contact') {
            throw new UserInputError(`Invalid team member role: ${role}`);
        }
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        const repo = this.connection.getRepository(ctx, CounterpartyTeamMember);
        const member = repo.create({
            counterpartyId: String(counterpartyId),
            administratorId: String(administratorId),
            role,
            phone: phone ?? null,
        });
        let saved: CounterpartyTeamMember;
        try {
            saved = await repo.save(member);
        } catch (e) {
            if (e instanceof QueryFailedError) {
                throw new UserInputError(
                    `Administrator ${administratorId} is already a team member of counterparty ${counterpartyId}`,
                );
            }
            throw e;
        }
        await this.versions.bump(ctx, counterparty.id);
        Logger.verbose(
            `Added team member administrator=${administratorId} to counterparty=${counterpartyId} (role=${role})`,
            loggerCtx,
        );
        return saved;
    }

    async removeTeamMember(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
    ): Promise<boolean> {
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        const repo = this.connection.getRepository(ctx, CounterpartyTeamMember);
        const result = await repo.delete({
            counterpartyId: String(counterpartyId),
            administratorId: String(administratorId),
        });
        if (!result.affected) return false;
        await this.versions.bump(ctx, counterparty.id);
        Logger.verbose(
            `Removed team member administrator=${administratorId} from counterparty=${counterpartyId}`,
            loggerCtx,
        );
        return true;
    }

    // Inbound only: the ERP's manager list becomes the team on first arrival. Never bumps, so it is not sent back.
    async seedFromErp(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorIds: readonly string[],
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, CounterpartyTeamMember);
        for (const administratorId of administratorIds) {
            await repo
                .createQueryBuilder()
                .insert()
                .values({
                    counterpartyId: String(counterpartyId),
                    administratorId,
                    role: 'observer',
                })
                .orIgnore()
                .execute();
        }
    }

    private async findCounterpartyOrFail(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<Counterparty> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);
        }
        return counterparty;
    }
}
