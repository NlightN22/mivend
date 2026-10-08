import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';

export interface VariantOrganizationHealth {
    total: number;
    withoutOrganization: number;
}

@Injectable()
export class VariantOrganizationHealthService {
    constructor(private readonly connection: TransactionalConnection) {}

    async get(): Promise<VariantOrganizationHealth> {
        const [row]: Array<{ total: number; withoutOrganization: number }> =
            await this.connection.rawConnection.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE "customFieldsOrganizationid" IS NULL)::int
                            AS "withoutOrganization"
                 FROM product_variant
                 WHERE "deletedAt" IS NULL AND enabled = true`,
            );
        return row;
    }
}
