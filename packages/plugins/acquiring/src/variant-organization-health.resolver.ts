import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { VariantOrganizationHealthService } from './variant-organization-health.service';
import type { VariantOrganizationHealth } from './variant-organization-health.service';

@Resolver()
export class VariantOrganizationHealthResolver {
    constructor(private readonly health: VariantOrganizationHealthService) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async variantOrganizationHealth(): Promise<VariantOrganizationHealth> {
        return this.health.get();
    }
}
