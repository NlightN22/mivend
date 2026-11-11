import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Contract } from '@mivend/plugin-counterparty';
import { OrganizationRequisites } from '@mivend/plugin-documents';
import { ctxQuery } from 'shared';
import type { OrderCheckSubject } from '@mivend/plugin-reservation';
import { In } from 'typeorm';

import { SettingErp } from '../entities/setting-erp.entity';
import { StorageLocationAssignment } from '../entities/storage-location-assignment.entity';
import { UnitRecord } from '../entities/unit-record.entity';
import { StockOrganizationReadService } from '../stock-organization-read.service';
import type { OrderCheckData } from './order-check-data';

// ERP setting code (SettingChanged.code example); true = the ERP skips the organization stock check for all.
export const ORGANIZATION_STOCK_IGNORE_SETTING = 'ignoreOrganizationStockCheckForAll';

@Injectable()
export class OrderCheckDataService {
    constructor(
        private connection: TransactionalConnection,
        private stockRead: StockOrganizationReadService,
    ) {}

    async load(ctx: RequestContext, subject: OrderCheckSubject): Promise<OrderCheckData> {
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
        const stockAll = await this.stockRead.getOrganizationStockByProduct(ctx, [
            ...storageOrganizations.keys(),
        ]);
        const stockByProduct = new Map<string, Map<string, number>>();
        for (const productErpId of storageOrganizations.keys()) {
            stockByProduct.set(productErpId, stockAll.get(productErpId) ?? new Map());
        }
        const organizationIds = new Set<string>(contractOrganizations);
        for (const line of subject.lines) {
            if (line.organizationErpId) organizationIds.add(line.organizationErpId);
        }
        for (const ids of storageOrganizations.values()) ids.forEach(id => organizationIds.add(id));
        const organizations = await this.organizations(ctx, [...organizationIds]);
        return {
            storageOrganizations,
            contractOrganizations,
            stockByProduct,
            organizationNames: new Map(organizations.map(r => [r.erpId, r.legalName])),
            organizationControlsStock: new Map(organizations.map(r => [r.erpId, r.controlsStock])),
            storageUnitRatios: await this.storageUnitRatios(ctx, productErpIds),
            organizationStockIgnoredGlobally: await this.ignoredGlobally(ctx),
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
        // unbounded-ok: assignments of the products of one order in one warehouse
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
        // unbounded-ok: active customer contracts of one counterparty
        const contracts = await this.connection.getRepository(ctx, Contract).find({
            where: { counterpartyId, isActive: true, isCustomerContract: true },
        });
        return new Set(contracts.map(c => c.organizationId).filter(id => id.length > 0));
    }

    private async organizations(
        ctx: RequestContext,
        erpIds: string[],
    ): Promise<OrganizationRequisites[]> {
        if (erpIds.length === 0) return [];
        return this.connection
            .getRepository(ctx, OrganizationRequisites)
            .find({ where: { erpId: In(erpIds) } });
    }

    private async storageUnitRatios(
        ctx: RequestContext,
        productErpIds: string[],
    ): Promise<Map<string, number>> {
        if (productErpIds.length === 0) return new Map();
        const rows = await ctxQuery<Array<{ productErpId: string; storageUnitId: string }>>(
            this.connection,
            ctx,
            `SELECT p."customFieldsExternalid" AS "productErpId",
                    p."customFieldsErpstorageunitid" AS "storageUnitId"
               FROM product p
              WHERE p."customFieldsExternalid" = ANY($1)
                AND p."customFieldsErpstorageunitid" IS NOT NULL`,
            [productErpIds],
        );
        if (rows.length === 0) return new Map();
        // unbounded-ok: units matched by the ids of one order
        const units = await this.connection.getRepository(ctx, UnitRecord).find({
            where: { entityId: In([...new Set(rows.map(r => r.storageUnitId))]) },
        });
        const ratioByUnit = new Map(units.map(u => [u.entityId, u.ratioToBase]));
        return new Map(
            rows.flatMap(r => {
                const ratio = ratioByUnit.get(r.storageUnitId);
                return ratio === undefined ? [] : [[r.productErpId, ratio] as const];
            }),
        );
    }

    private async ignoredGlobally(ctx: RequestContext): Promise<boolean> {
        const setting = await this.connection.getRepository(ctx, SettingErp).findOne({
            where: { code: ORGANIZATION_STOCK_IGNORE_SETTING, isDeleted: false },
        });
        return setting?.boolValue === true;
    }
}
