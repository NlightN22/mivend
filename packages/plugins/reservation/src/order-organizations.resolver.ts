import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Order, OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';

@Resolver('Order')
export class OrderOrganizationsResolver {
    constructor(private connection: TransactionalConnection) {}

    @ResolveField()
    async organizations(@Ctx() ctx: RequestContext, @Parent() order: Order): Promise<string[]> {
        const lines = await this.connection
            .getRepository(ctx, OrderLine)
            .find({ where: { order: { id: order.id } }, order: { id: 'ASC' } });
        const ids = [
            ...new Set(
                lines.map(l => l.customFields?.organizationId).filter((id): id is string => !!id),
            ),
        ];
        if (ids.length === 0) return [];
        const rows: Array<{ erpId: string; legalName: string }> =
            await this.connection.rawConnection.query(
                `SELECT "erpId", "legalName" FROM organization_requisites WHERE "erpId" = ANY($1)`,
                [ids],
            );
        const names = new Map(rows.map(r => [r.erpId, r.legalName]));
        return ids.map(id => names.get(id)).filter((n): n is string => !!n);
    }
}
