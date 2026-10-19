import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

export interface VariantOrganizationHealth {
    total: number;
    withoutOrganization: number;
}

@Injectable()
export class VariantOrganizationHealthService {
    constructor(private readonly connection: TransactionalConnection) {}

    async get(ctx: RequestContext): Promise<VariantOrganizationHealth> {
        const [row] = await ctxQuery<Array<{ total: number; withoutOrganization: number }>>(
            this.connection,
            ctx,
            `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE "customFieldsOrganizationid" IS NULL)::int
                            AS "withoutOrganization"
                 FROM product_variant
                 WHERE "deletedAt" IS NULL AND enabled = true`,
        );
        return row;
    }
}
