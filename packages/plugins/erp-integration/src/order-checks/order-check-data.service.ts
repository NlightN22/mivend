import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Contract } from '@mivend/plugin-counterparty';
import { OrganizationRequisites } from '@mivend/plugin-documents';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';
import { In } from 'typeorm';

import { StorageLocationAssignment } from '../entities/storage-location-assignment.entity';
import { StockOrganizationReadService } from '../stock-organization-read.service';
import type { OrderCheckData } from './order-check-data';

@Injectable()
export class OrderCheckDataService {
    constructor(
        private connection: TransactionalConnection,
        private stockRead: StockOrganizationReadService,
    ) {}

    async load(
        ctx: RequestContext,
        subject: OrderCheckSubject,
        options: { withStock: boolean },
    ): Promise<OrderCheckData> {
        const productErpIds = [
            ...new Set(subject.lines.map(l => l.productErpId).filter((id): id is string => !!id)),
        ];
        const storageOrganizations = await this.storageOrganizations(
            ctx,
            productErpIds,
            subject.warehouseErpId,
        );
        const contractOrganizations = await this.contractOrganizations(
            ctx,
            subject.buyerCounterpartyId,
        );
        const stockByProduct = new Map<string, Map<string, number>>();
        if (options.withStock) {
            for (const productErpId of storageOrganizations.keys()) {
                stockByProduct.set(
                    productErpId,
                    await this.stockRead.getOrganizationStock(ctx, [productErpId]),
                );
            }
        }
        const organizationIds = new Set<string>(contractOrganizations);
        for (const ids of storageOrganizations.values()) ids.forEach(id => organizationIds.add(id));
        return {
            storageOrganizations,
            contractOrganizations,
            stockByProduct,
            organizationNames: await this.organizationNames(ctx, [...organizationIds]),
        };
    }

    // Rows without a warehouse cannot be placed at the order warehouse, so they are not counted.
    private async storageOrganizations(
        ctx: RequestContext,
        productErpIds: string[],
        warehouseErpId: string | null,
    ): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();
        if (productErpIds.length === 0 || !warehouseErpId) return result;
        const rows = await this.connection.getRepository(ctx, StorageLocationAssignment).find({
            where: { productId: In(productErpIds), warehouseId: warehouseErpId },
        });
        for (const row of rows) {
            const ids = result.get(row.productId) ?? [];
            if (!ids.includes(row.organizationErpId)) ids.push(row.organizationErpId);
            result.set(row.productId, ids);
        }
        return result;
    }

    // Matched on the buyer's counterparty id: the customer-contract flag alone also covers employee contracts.
    private async contractOrganizations(
        ctx: RequestContext,
        counterpartyId: string | null,
    ): Promise<Set<string>> {
        if (!counterpartyId) return new Set();
        const contracts = await this.connection.getRepository(ctx, Contract).find({
            where: { counterpartyId, isActive: true, isCustomerContract: true },
        });
        return new Set(contracts.map(c => c.organizationId).filter(id => id.length > 0));
    }

    private async organizationNames(
        ctx: RequestContext,
        erpIds: string[],
    ): Promise<Map<string, string>> {
        if (erpIds.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .find({ where: { erpId: In(erpIds) } });
        return new Map(rows.map(r => [r.erpId, r.legalName]));
    }
}
