import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { CheckPolicyService, UpdateCheckPolicyInput } from './check-policy.service';
import { CheckRegistry } from './check-registry';
import { CheckPolicy } from './entities/check-policy.entity';
import { CheckResult } from './entities/check-result.entity';
import { ChecksService } from './checks.service';
import { DEFAULT_CONSEQUENCE } from './types';

@Resolver()
export class ChecksResolver {
    constructor(
        private checks: ChecksService,
        private policies: CheckPolicyService,
        private registry: CheckRegistry,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadCheckResults.Permission)
    checkResults(
        @Ctx() ctx: RequestContext,
        @Args() args: { subjectType: string; subjectId: string },
    ): Promise<CheckResult[]> {
        return this.checks.findResults(ctx, args.subjectType, args.subjectId);
    }

    @Query()
    @Allow(CustomPermission.ReadCheckResults.Permission)
    checkDefinitions(@Args() args: { subjectType?: string }): unknown[] {
        return this.registry.listChecks(args.subjectType ?? undefined).map(p => ({
            code: p.code,
            subjectType: p.subjectType,
            stages: p.stages,
            description: p.description,
            defaultConsequence: p.defaultConsequence ?? DEFAULT_CONSEQUENCE,
            allowedConsequences: this.registry.getSubjectType(p.subjectType).allowedConsequences,
        }));
    }

    @Query()
    @Allow(CustomPermission.ManageCheckPolicies.Permission)
    checkPolicies(
        @Ctx() ctx: RequestContext,
        @Args() args: { subjectType?: string },
    ): Promise<CheckPolicy[]> {
        return this.policies.list(ctx, args.subjectType ?? undefined);
    }

    @Mutation()
    @Transaction()
    @Allow(CustomPermission.ManageCheckPolicies.Permission)
    updateCheckPolicy(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: UpdateCheckPolicyInput },
    ): Promise<CheckPolicy> {
        return this.policies.update(ctx, args.input);
    }
}
