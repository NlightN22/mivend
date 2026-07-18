import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Logger, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { QueryFailedError } from 'typeorm';

import { Counterparty } from './entities/counterparty.entity';
import {
    CounterpartyTeamMember,
    CounterpartyTeamMemberRole,
} from './entities/counterparty-team-member.entity';
import { loggerCtx } from './types';

@Injectable()
export class CounterpartyTeamService {
    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
    ) {}

    async getTeamMembers(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<CounterpartyTeamMember[]> {
        return this.connection.getRepository(ctx, CounterpartyTeamMember).find({
            where: { counterpartyId: String(counterpartyId) },
            order: { createdAt: 'ASC' },
        });
    }

    // Gated by CustomPermission.ManageCounterpartyTeam at the resolver, same
    // own/department/all write-scope check reassignManager uses (assertCounterpartyWritable) —
    // a department-head may only add to a counterparty already in their own department/branch.
    async addTeamMember(
        ctx: RequestContext,
        counterpartyId: ID,
        administratorId: ID,
        role: CounterpartyTeamMemberRole,
    ): Promise<CounterpartyTeamMember> {
        if (role !== 'backup' && role !== 'observer') {
            throw new UserInputError(`Invalid team member role: ${role}`);
        }
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        const repo = this.connection.getRepository(ctx, CounterpartyTeamMember);
        const member = repo.create({
            counterpartyId: String(counterpartyId),
            administratorId: String(administratorId),
            role,
        });
        try {
            const saved = await repo.save(member);
            Logger.verbose(
                `Added team member administrator=${administratorId} to counterparty=${counterpartyId} (role=${role})`,
                loggerCtx,
            );
            return saved;
        } catch (e) {
            if (e instanceof QueryFailedError) {
                throw new UserInputError(
                    `Administrator ${administratorId} is already a team member of counterparty ${counterpartyId}`,
                );
            }
            throw e;
        }
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
        Logger.verbose(
            `Removed team member administrator=${administratorId} from counterparty=${counterpartyId}`,
            loggerCtx,
        );
        return (result.affected ?? 0) > 0;
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
