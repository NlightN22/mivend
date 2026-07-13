import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    CustomerService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { randomUUID } from 'crypto';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { ChangedFieldDiff, VersioningService } from '@mivend/plugin-versioning';

import { ContactPerson } from './entities/contact-person.entity';
import { Counterparty } from './entities/counterparty.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { loggerCtx } from './types';

export interface TradingPointDetailsPatch {
    name?: string;
    address?: string;
    workingHours?: string | null;
    deliveryComment?: string | null;
    contacts?: Array<{
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }>;
}

export interface TradingPointUpsertPayload {
    erpId: string;
    counterpartyErpId: string;
    name: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    workingHours?: string | null;
    isActive: boolean;
    contacts?: Array<{
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }>;
}

@Injectable()
export class TradingPointService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private accessScopeService: AccessScopeService,
        private versioningService: VersioningService,
    ) {}

    // Shared by updateDetails/setActive — resolves the owning Counterparty and asserts the
    // caller's counterparty scope covers it (own/department/all, see
    // AccessScopeService.assertCounterpartyWritable). Distinct from the customerAdd/Edit/
    // Delete/Restore methods below, which are shop-API self-service and scoped by ownership
    // (counterpartyId equality) rather than a staff role's visibility scope.
    private async assertStaffCanEdit(
        ctx: RequestContext,
        tradingPoint: TradingPoint,
    ): Promise<void> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: tradingPoint.counterpartyId } });
        if (!counterparty) throw new UserInputError('Counterparty not found for trading point');
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);
    }

    // Staff-initiated patch (manager portal), distinct from the ERP-sync `upsert` above: keyed
    // by id (not erpId), partial (only provided fields change), and gated by the caller's
    // counterparty visibility scope rather than Permission.UpdateCustomer — "if you can see the
    // customer, you can fix their trading point data" (see docs/ai plan for this feature).
    // Every successful patch is recorded via VersioningService for the History tab.
    async updateDetails(
        ctx: RequestContext,
        id: ID,
        patch: TradingPointDetailsPatch,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const record = await repo.findOne({ where: { id: String(id) }, relations: ['contacts'] });
        if (!record) throw new UserInputError(`TradingPoint not found: id=${id}`);
        await this.assertStaffCanEdit(ctx, record);

        const changedFields: Record<string, ChangedFieldDiff> = {};
        const cpRepo = this.connection.getRepository(ctx, ContactPerson);

        if (patch.name !== undefined && patch.name !== record.name) {
            changedFields.name = { from: record.name, to: patch.name };
            record.name = patch.name;
        }
        if (patch.address !== undefined && patch.address !== record.address) {
            changedFields.address = { from: record.address, to: patch.address };
            record.address = patch.address;
        }
        if (patch.workingHours !== undefined && patch.workingHours !== record.workingHours) {
            changedFields.workingHours = { from: record.workingHours, to: patch.workingHours };
            record.workingHours = patch.workingHours;
        }
        if (
            patch.deliveryComment !== undefined &&
            patch.deliveryComment !== record.deliveryComment
        ) {
            changedFields.deliveryComment = {
                from: record.deliveryComment,
                to: patch.deliveryComment,
            };
            record.deliveryComment = patch.deliveryComment;
        }
        if (patch.contacts !== undefined) {
            changedFields.contacts = {
                from: record.contacts.length,
                to: patch.contacts.length,
            };
            await cpRepo.delete({ tradingPoint: { id: record.id } });
            record.contacts = patch.contacts.map(c =>
                cpRepo.create({
                    name: c.name,
                    phone: c.phone ?? null,
                    email: c.email ?? null,
                    isPrimary: c.isPrimary ?? false,
                }),
            );
        }

        const saved = await repo.save(record);
        if (Object.keys(changedFields).length > 0) {
            await this.versioningService.recordChange(ctx, {
                entityName: 'TradingPoint',
                entityId: saved.id,
                action: 'update',
                changedFields,
            });
        }
        Logger.verbose(`Staff updated trading point details id=${id}`, loggerCtx);
        return saved;
    }

    // Sets both isActive and customerStatus together — mirrors customerRestore's existing
    // precedent (line below) rather than exposing the two overlapping flags separately, so
    // staff has one "Reactivate"/"Deactivate" action regardless of whether the trading point
    // went inactive via ERP (isActive) or customer self-service (customerStatus).
    async setActive(ctx: RequestContext, id: ID, isActive: boolean): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const record = await repo.findOne({ where: { id: String(id) } });
        if (!record) throw new UserInputError(`TradingPoint not found: id=${id}`);
        await this.assertStaffCanEdit(ctx, record);

        record.isActive = isActive;
        record.customerStatus = isActive ? 'active' : 'hidden';
        const saved = await repo.save(record);

        await this.versioningService.recordChange(ctx, {
            entityName: 'TradingPoint',
            entityId: saved.id,
            action: isActive ? 'reactivate' : 'deactivate',
        });
        Logger.verbose(`Staff set trading point id=${id} active=${isActive}`, loggerCtx);
        return saved;
    }

    async upsert(ctx: RequestContext, payload: TradingPointUpsertPayload): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);

        const counterpartyRow = await this.connection.rawConnection.query(
            `SELECT id FROM counterparty WHERE "erpId" = $1 LIMIT 1`,
            [payload.counterpartyErpId],
        );
        if (!counterpartyRow[0]) {
            throw new UserInputError(
                `Counterparty not found for erpId=${payload.counterpartyErpId}`,
            );
        }
        const counterpartyId: string = counterpartyRow[0].id;

        let record = await repo.findOne({
            where: { erpId: payload.erpId },
            relations: ['contacts'],
        });
        if (record) {
            record.name = payload.name;
            record.address = payload.address;
            record.latitude = payload.latitude ?? null;
            record.longitude = payload.longitude ?? null;
            record.workingHours = payload.workingHours ?? null;
            record.isActive = payload.isActive;
            record.counterpartyId = counterpartyId;
        } else {
            record = repo.create({
                erpId: payload.erpId,
                counterpartyId,
                name: payload.name,
                address: payload.address,
                latitude: payload.latitude ?? null,
                longitude: payload.longitude ?? null,
                workingHours: payload.workingHours ?? null,
                isActive: payload.isActive,
                contacts: [],
            });
        }

        if (payload.contacts !== undefined) {
            const cpRepo = this.connection.getRepository(ctx, ContactPerson);
            if (record.id) {
                await cpRepo.delete({ tradingPoint: { id: record.id } });
            }
            record.contacts = payload.contacts.map(c =>
                cpRepo.create({
                    name: c.name,
                    phone: c.phone ?? null,
                    email: c.email ?? null,
                    isPrimary: c.isPrimary ?? false,
                }),
            );
        }

        const saved = await repo.save(record);
        Logger.verbose(`Upserted trading point erpId=${payload.erpId}`, loggerCtx);
        return saved;
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<void> {
        await this.connection
            .getRepository(ctx, TradingPoint)
            .update({ erpId }, { isActive: false });
        Logger.verbose(`Deactivated trading point erpId=${erpId}`, loggerCtx);
    }

    // Shop API callers (customer self-service) must never see a trading point staff deactivated
    // — only Admin API (manager portal) needs inactive ones visible, so staff can reactivate them.
    async findByCounterparty(ctx: RequestContext, counterpartyId: ID): Promise<TradingPoint[]> {
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: {
                counterpartyId: String(counterpartyId),
                ...(ctx.apiType === 'admin' ? {} : { isActive: true }),
            },
            relations: ['contacts'],
            order: { name: 'ASC' },
        });
    }

    async findById(ctx: RequestContext, id: ID): Promise<TradingPoint | null> {
        return this.connection
            .getRepository(ctx, TradingPoint)
            .findOne({ where: { id: String(id) }, relations: ['contacts'] });
    }

    async getPreferredForCustomer(
        ctx: RequestContext,
        customerId: ID,
    ): Promise<TradingPoint | null> {
        const rows = await this.connection.rawConnection.query(
            `SELECT cu."customFieldsPreferredtradingpointid" AS tpid FROM customer cu WHERE cu.id = $1`,
            [customerId],
        );
        const tpId: string | undefined = rows[0]?.tpid;
        if (!tpId) return null;
        return this.findById(ctx, tpId);
    }

    async setPreferred(ctx: RequestContext, customerId: ID, tradingPointId: ID): Promise<void> {
        const tp = await this.findById(ctx, tradingPointId);
        if (!tp) throw new UserInputError(`TradingPoint not found: id=${tradingPointId}`);
        await this.customerService.update(ctx, {
            id: customerId,
            customFields: { preferredTradingPointId: String(tradingPointId) } as Record<
                string,
                unknown
            >,
        });
        Logger.verbose(
            `Set preferred trading point ${tradingPointId} for customer ${customerId}`,
            loggerCtx,
        );
    }

    async updateDeliveryComment(
        ctx: RequestContext,
        tradingPointId: ID,
        comment: string | null,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        await repo.update({ id: String(tradingPointId) }, { deliveryComment: comment });
        const updated = await this.findById(ctx, tradingPointId);
        if (!updated) throw new UserInputError(`TradingPoint not found: id=${tradingPointId}`);
        return updated;
    }

    async findVisibleForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<TradingPoint[]> {
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: {
                counterpartyId: String(counterpartyId),
                isActive: true,
                customerStatus: 'active',
            },
            relations: ['contacts'],
            order: { name: 'ASC' },
        });
    }

    async findHiddenForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<TradingPoint[]> {
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: { counterpartyId: String(counterpartyId), customerStatus: 'hidden' },
            relations: ['contacts'],
            order: { name: 'ASC' },
        });
    }

    async getCounterpartyIdForUser(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await this.connection.rawConnection.query(
            `SELECT cu."customFieldsCounterpartyid" AS cid FROM customer cu WHERE cu."userId" = $1 LIMIT 1`,
            [ctx.activeUserId],
        );
        return rows?.[0]?.cid ?? null;
    }

    async customerAdd(
        ctx: RequestContext,
        counterpartyId: string,
        input: CustomerTradingPointInput,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const cpRepo = this.connection.getRepository(ctx, ContactPerson);
        const contact = input.contactName
            ? cpRepo.create({
                  name: input.contactName,
                  phone: input.contactPhone ?? null,
                  email: null,
                  isPrimary: true,
              })
            : null;
        const record = repo.create({
            erpId: `cust_${randomUUID()}`,
            counterpartyId,
            name: input.name,
            address: input.address,
            workingHours: input.workingHours ?? null,
            deliveryComment: input.deliveryComment ?? null,
            isActive: true,
            customerStatus: 'active',
            customerOwned: true,
            contacts: contact ? [contact] : [],
        });
        const saved = await repo.save(record);
        Logger.verbose(`Customer added trading point ${saved.id}`, loggerCtx);
        return saved;
    }

    async customerEdit(
        ctx: RequestContext,
        id: ID,
        counterpartyId: string,
        input: CustomerTradingPointInput,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const cpRepo = this.connection.getRepository(ctx, ContactPerson);
        const record = await repo.findOne({
            where: { id: String(id), counterpartyId },
            relations: ['contacts'],
        });
        if (!record) throw new UserInputError(`TradingPoint not found or access denied`);
        record.name = input.name;
        record.address = input.address;
        record.workingHours = input.workingHours ?? null;
        record.deliveryComment = input.deliveryComment ?? null;
        if (input.contactName !== undefined) {
            await cpRepo.delete({ tradingPoint: { id: record.id } });
            record.contacts = input.contactName
                ? [
                      cpRepo.create({
                          name: input.contactName,
                          phone: input.contactPhone ?? null,
                          email: null,
                          isPrimary: true,
                      }),
                  ]
                : [];
        }
        const saved = await repo.save(record);
        Logger.verbose(`Customer edited trading point ${id}`, loggerCtx);
        return saved;
    }

    async customerDelete(ctx: RequestContext, id: ID, counterpartyId: string): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const record = await repo.findOne({ where: { id: String(id), counterpartyId } });
        if (!record) throw new UserInputError(`TradingPoint not found or access denied`);
        await repo.update({ id: String(id) }, { customerStatus: 'hidden' });
        Logger.verbose(`Customer soft-deleted trading point ${id}`, loggerCtx);
        return true;
    }

    async customerRestore(
        ctx: RequestContext,
        id: ID,
        counterpartyId: string,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const record = await repo.findOne({ where: { id: String(id), counterpartyId } });
        if (!record) throw new UserInputError(`TradingPoint not found or access denied`);
        await repo.update({ id: String(id) }, { customerStatus: 'active', isActive: true });
        const updated = await this.findById(ctx, id);
        if (!updated) throw new UserInputError(`TradingPoint not found: id=${id}`);
        return updated;
    }
}

export interface CustomerTradingPointInput {
    name: string;
    address: string;
    workingHours?: string | null;
    deliveryComment?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
}
