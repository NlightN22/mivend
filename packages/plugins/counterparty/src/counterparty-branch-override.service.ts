import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { AccessScopeService, DepartmentBranchMappingService } from '@mivend/plugin-access-control';
import { VersioningService } from '@mivend/plugin-versioning';

import { Counterparty } from './entities/counterparty.entity';

// Same write rules as a manager reassignment: scope check on the row, one version entry per change.
@Injectable()
export class CounterpartyBranchOverrideService {
    constructor(
        private connection: TransactionalConnection,
        private mappingService: DepartmentBranchMappingService,
        private accessScopeService: AccessScopeService,
        private versioningService: VersioningService,
    ) {}

    // Null clears the override and re-runs the automatic rule.
    async setOverride(
        ctx: RequestContext,
        counterpartyId: ID,
        branchId: string | null,
    ): Promise<void> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
        if (!counterparty) throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);
        const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
        this.accessScopeService.assertCounterpartyWritableInScope(scope, counterparty);

        const { previous } = await this.mappingService.setCounterpartyOverride(
            ctx,
            String(counterpartyId),
            branchId,
        );
        await this.versioningService.recordChange(ctx, {
            entityName: 'Counterparty',
            entityId: counterpartyId,
            action: 'update',
            changedFields: {
                branchOverrideId: { from: previous, to: branchId },
            },
        });
    }
}
