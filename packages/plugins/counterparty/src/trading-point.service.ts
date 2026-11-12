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
import { Not } from 'typeorm';
import { AccessScopeService, BranchSettingsService } from '@mivend/plugin-access-control';
import { ActingContextService } from '@mivend/plugin-session-management';
import { ChangedFieldDiff, VersioningService } from '@mivend/plugin-versioning';

import { ContactPerson } from './entities/contact-person.entity';
import { Counterparty } from './entities/counterparty.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointErp } from './entities/trading-point-erp.entity';
import { TradingPointChange } from './entities/trading-point-change.entity';
import { savePendingChange, type ProposedPointFields } from './trading-point-change';
import { writeErpMirror } from './trading-point-erp-mirror';
import { markMirrorDeleted, type ErpPointExtra } from './trading-point-erp-extra';
import { loggerCtx } from './types';
import {
    fillMissingLocation,
    isUsableLocation,
    resolveTradingPointLocation,
} from './trading-point-location';
import { ctxQuery, normalizePhone, validateTradingPointContact, type ContactField } from 'shared';

export interface TradingPointDetailsPatch {
    name?: string;
    address?: string;
    workingHours?: string | null;
    deliveryComment?: string | null;
    // Explicit staff override for a chain account whose locations span multiple branches — see
    // TradingPoint.servicingBranchId. Not set by ERP sync; only by a staff edit through this patch.
    servicingBranchId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    contacts?: Array<{
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }>;
}

export interface CounterpartyRef {
    id: string;
    branchId: string | null;
}

// Fields from the `point-of-sale` Kafka stream (issue #100). `undefined` = leave unchanged
// (tombstone); on a named event the handler sends '' / null for a cleared value (#259).
export interface TradingPointStreamFields {
    name: string | null;
    counterpartyId: string;
    servicingBranchId: string | null;
    isActive: boolean;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
    // Never used to create a ContactPerson — see upsertFromStream's own comment.
    contactPhone?: string | null;
    extra?: ErpPointExtra;
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

type TpRow = { tpid: string | null };

@Injectable()
export class TradingPointService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private accessScopeService: AccessScopeService,
        private versioningService: VersioningService,
        private branchSettingsService: BranchSettingsService,
        private actingContext?: ActingContextService,
    ) {}

    // Staff role visibility scope is enforced here, not ownership; customer* shop-API methods differ.
    //
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

    // Gated by counterparty visibility scope, not Permission.UpdateCustomer, by design.
    // Each successful patch must be recorded via VersioningService; the History tab depends on it.
    async updateDetails(
        ctx: RequestContext,
        id: ID,
        patch: TradingPointDetailsPatch,
    ): Promise<TradingPoint> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        // Raw lock: FOR UPDATE through find() would join the eager contacts (nullable side of an outer join).
        await ctxQuery(
            this.connection,
            ctx,
            `SELECT id FROM trading_point WHERE id = $1 FOR UPDATE`,
            [String(id)],
        );
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
        const location = resolveTradingPointLocation(patch, record);
        if (location.latitude !== record.latitude || location.longitude !== record.longitude) {
            changedFields.location = {
                from: { latitude: record.latitude, longitude: record.longitude },
                to: location,
            };
            record.latitude = location.latitude;
            record.longitude = location.longitude;
        }
        if (
            patch.servicingBranchId !== undefined &&
            patch.servicingBranchId !== record.servicingBranchId
        ) {
            changedFields.servicingBranchId = {
                from: record.servicingBranchId,
                to: patch.servicingBranchId,
            };
            record.servicingBranchId = patch.servicingBranchId;
        }
        if (patch.contacts !== undefined) {
            // Compare contact values, not counts: the edit form always sends the full contacts array.
            // A count or presence check logs spurious 'contacts: 0 -> 0' versions and needless delete+recreate.
            const before = record.contacts.map(c => ({
                name: c.name,
                phone: c.phone,
                email: c.email,
                isPrimary: c.isPrimary,
            }));
            const after = patch.contacts.map(c => ({
                name: c.name,
                phone: c.phone ?? null,
                email: c.email ?? null,
                isPrimary: c.isPrimary ?? false,
            }));
            // Contacts load without a stable order, so compare them as a set.
            const key = (list: typeof after): string =>
                list
                    .map(c => JSON.stringify(c))
                    .sort()
                    .join();
            if (key(before) !== key(after)) {
                changedFields.contacts = { from: before, to: after };
                await cpRepo.delete({ tradingPoint: { id: record.id } });
                record.contacts = after.map(c => cpRepo.create(c));
            }
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

    // Sets isActive and customerStatus together, as customerRestore does, so one action covers both.
    // Deactivation may come from ERP (isActive) or customer self-service (customerStatus).
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

        const counterpartyRow = await ctxQuery<Array<{ id: string; branchId: string | null }>>(
            this.connection,
            ctx,
            `SELECT id, "branchId" FROM counterparty WHERE "erpId" = $1 LIMIT 1`,
            [payload.counterpartyErpId],
        );
        if (!counterpartyRow[0]) {
            throw new UserInputError(
                `Counterparty not found for erpId=${payload.counterpartyErpId}`,
            );
        }
        const counterpartyId: string = counterpartyRow[0].id;
        const counterpartyBranchId: string | null = counterpartyRow[0].branchId ?? null;

        let record = await repo.findOne({
            where: { erpId: payload.erpId },
            relations: ['contacts'],
        });
        await writeErpMirror(this.connection.getRepository(ctx, TradingPointErp), payload.erpId, {
            ...payload,
            counterpartyId,
        });
        if (record) {
            // mivend's record is the source of truth; the ERP only moves activity and ownership.
            record.isActive = payload.isActive;
            record.counterpartyId = counterpartyId;
        } else {
            record = repo.create({
                erpId: payload.erpId,
                counterpartyId,
                servicingBranchId: counterpartyBranchId,
                name: payload.name,
                address: payload.address,
                latitude: payload.latitude ?? null,
                longitude: payload.longitude ?? null,
                workingHours: payload.workingHours ?? null,
                isActive: payload.isActive,
                contacts: [],
            });
            if (payload.contacts !== undefined) {
                const cpRepo = this.connection.getRepository(ctx, ContactPerson);
                record.contacts = payload.contacts.map(c =>
                    cpRepo.create({
                        name: c.name,
                        phone: c.phone ?? null,
                        email: c.email ?? null,
                        isPrimary: c.isPrimary ?? false,
                    }),
                );
            }
        }

        const saved = await repo.save(record);
        Logger.verbose(`Upserted trading point erpId=${payload.erpId}`, loggerCtx);
        return saved;
    }

    // Issue #100: lets PointOfSaleStreamHandler check-then-throw a retryable
    // MissingDependencyError itself, mirroring CounterpartyStreamHandler's own pattern.
    async findCounterpartyRefByErpId(
        ctx: RequestContext,
        erpId: string,
    ): Promise<CounterpartyRef | null> {
        const rows = await ctxQuery<Array<{ id: string; branchId: string | null }>>(
            this.connection,
            ctx,
            `SELECT id, "branchId" FROM counterparty WHERE "erpId" = $1 LIMIT 1`,
            [erpId],
        );
        return rows[0] ? { id: rows[0].id, branchId: rows[0].branchId ?? null } : null;
    }

    // A missing name (tombstone) for a new erpId means 'don't create'; a missing address still creates the point.
    async upsertFromStream(
        ctx: RequestContext,
        erpId: string,
        fields: TradingPointStreamFields,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, TradingPoint);
        let record = await repo.findOne({ where: { erpId }, relations: ['contacts'] });
        const usable = isUsableLocation(fields.latitude, fields.longitude);
        if (record || fields.name) {
            await writeErpMirror(
                this.connection.getRepository(ctx, TradingPointErp),
                erpId,
                fields,
            );
        }

        if (!record) {
            if (!fields.name) {
                Logger.verbose(
                    `trading point ${erpId}: no name (deletion tombstone), no existing row — nothing to create`,
                    loggerCtx,
                );
                return;
            }
            record = repo.create({
                erpId,
                counterpartyId: fields.counterpartyId,
                servicingBranchId: fields.servicingBranchId,
                name: fields.name,
                address: fields.address ?? '',
                latitude: usable ? fields.latitude! : null,
                longitude: usable ? fields.longitude! : null,
                workingHours: null,
                isActive: fields.isActive,
                contacts: [],
            });
        } else {
            // mivend's record is the source of truth; the ERP only moves activity and ownership.
            record.isActive = fields.isActive;
            record.counterpartyId = fields.counterpartyId;
            if (!record.address && fields.address) record.address = fields.address;
        }

        await repo.save(record);
        if (usable) {
            await fillMissingLocation(repo, record.id, {
                latitude: fields.latitude!,
                longitude: fields.longitude!,
            });
        }
        Logger.verbose(`Upserted trading point erpId=${erpId} from Kafka stream`, loggerCtx);
    }

    async markErpDeleted(ctx: RequestContext, erpId: string): Promise<boolean> {
        return markMirrorDeleted(this.connection.getRepository(ctx, TradingPointErp), erpId);
    }

    async deactivate(ctx: RequestContext, erpId: string): Promise<boolean> {
        const result = await this.connection
            .getRepository(ctx, TradingPoint)
            .update({ erpId }, { isActive: false });
        Logger.verbose(`Deactivated trading point erpId=${erpId}`, loggerCtx);
        return (result.affected ?? 0) > 0;
    }

    // Shop API callers (customer self-service) must never see a trading point staff deactivated
    // — only Admin API (manager portal) needs inactive ones visible, so staff can reactivate them.
    async findByCounterparty(ctx: RequestContext, counterpartyId: ID): Promise<TradingPoint[]> {
        // unbounded-ok: trading points of one counterparty
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: {
                counterpartyId: String(counterpartyId),
                ...(ctx.apiType === 'admin' ? {} : { isActive: true, address: Not('') }),
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

    // Shop API: only the caller's own counterparty. A hidden own point is returned (myHiddenTradingPoints
    // lists it too); a staff-deactivated one never is, as in findByCounterparty.
    async findOwnById(ctx: RequestContext, id: ID): Promise<TradingPoint | null> {
        const counterpartyId = await this.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return null;
        return this.connection.getRepository(ctx, TradingPoint).findOne({
            where: { id: String(id), counterpartyId, isActive: true, address: Not('') },
            relations: ['contacts'],
        });
    }

    // Self-heals a missing/inactive/hidden preferred point (first active one wins); an acting session only reads it.
    async getPreferredForCustomer(
        ctx: RequestContext,
        customerId: ID,
    ): Promise<TradingPoint | null> {
        const acting = await this.actingContext?.get(ctx);
        if (acting?.tradingPointId) return this.findById(ctx, acting.tradingPointId);
        const pick = `COALESCE(
                 (SELECT tp.id::text FROM trading_point tp WHERE tp.id::text = cu."customFieldsPreferredtradingpointid"
                    AND tp."isActive" AND tp.address <> '' AND tp."customerStatus" = 'active'),
                 (SELECT tp.id::text FROM trading_point tp WHERE tp."counterpartyId"::text = cu."customFieldsCounterpartyid"::text
                    AND tp."isActive" AND tp.address <> '' AND tp."customerStatus" = 'active' ORDER BY tp.name, tp.id LIMIT 1),
                 cu."customFieldsPreferredtradingpointid")`;
        const rows = await ctxQuery<TpRow[] | [TpRow[], number]>(
            this.connection,
            ctx,
            acting
                ? `SELECT ${pick} AS tpid FROM customer cu WHERE cu.id = $1`
                : `UPDATE customer cu SET "customFieldsPreferredtradingpointid" = ${pick}
                   WHERE cu.id = $1 RETURNING cu."customFieldsPreferredtradingpointid" AS tpid`,
            [customerId],
        );
        // UPDATE returns [rows, rowCount] from the postgres driver, SELECT a plain row list.
        const tpId = (acting ? (rows as TpRow[]) : (rows as [TpRow[], number])[0])[0]?.tpid;
        if (!tpId) return null;
        return this.findById(ctx, tpId);
    }

    // Read-time fallback (#198): point override, else counterparty branch, else the global default.
    async resolveServicingBranchId(
        ctx: RequestContext,
        tradingPoint: Pick<TradingPoint, 'servicingBranchId' | 'counterpartyId'>,
    ): Promise<string | null> {
        if (tradingPoint.servicingBranchId) return tradingPoint.servicingBranchId;
        const rows = await ctxQuery<Array<{ branchId: string | null }>>(
            this.connection,
            ctx,
            `SELECT "branchId" FROM counterparty WHERE id::text = $1 LIMIT 1`,
            [String(tradingPoint.counterpartyId)],
        );
        return (
            rows[0]?.branchId ?? (await this.branchSettingsService.getGlobalDefaultBranchId(ctx))
        );
    }

    async setPreferred(ctx: RequestContext, customerId: ID, tradingPointId: ID): Promise<void> {
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT tp.id FROM trading_point tp
             JOIN customer cu ON tp."counterpartyId"::text = cu."customFieldsCounterpartyid"::text
             WHERE cu.id = $1 AND tp.id::text = $2 AND tp."isActive" AND tp.address <> '' AND tp."customerStatus" = 'active'`,
            [customerId, String(tradingPointId)],
        );
        if (!rows[0]) throw new UserInputError(`TradingPoint not found or access denied`);
        if (await this.actingContext?.get(ctx)) {
            await this.actingContext?.setTradingPoint(ctx, String(tradingPointId));
            return;
        }
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
        const point = await this.findById(ctx, tradingPointId);
        if (!point) throw new UserInputError(`TradingPoint not found: id=${tradingPointId}`);
        await this.assertStaffCanEdit(ctx, point);
        await repo.update({ id: String(tradingPointId) }, { deliveryComment: comment });
        return (await this.findById(ctx, tradingPointId)) ?? point;
    }

    async findVisibleForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<TradingPoint[]> {
        // unbounded-ok: active trading points of one counterparty
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: {
                counterpartyId: String(counterpartyId),
                isActive: true,
                address: Not(''),
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
        // unbounded-ok: hidden trading points of one counterparty
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: { counterpartyId: String(counterpartyId), customerStatus: 'hidden', address: Not('') },
            relations: ['contacts'],
            order: { name: 'ASC' },
        });
    }

    async getCounterpartyIdForUser(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await ctxQuery<Array<{ cid: string | null }>>(
            this.connection,
            ctx,
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
        input = normalizeCustomerInput(input);
        const location = resolveTradingPointLocation(input);
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const cpRepo = this.connection.getRepository(ctx, ContactPerson);
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
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
            servicingBranchId: counterparty?.branchId ?? null,
            name: input.name,
            address: input.address,
            latitude: location.latitude,
            longitude: location.longitude,
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
        input = normalizeCustomerInput(input);
        const repo = this.connection.getRepository(ctx, TradingPoint);
        const cpRepo = this.connection.getRepository(ctx, ContactPerson);
        await ctxQuery(
            this.connection,
            ctx,
            `SELECT id FROM trading_point WHERE id = $1 FOR UPDATE`,
            [String(id)],
        );
        const record = await repo.findOne({
            where: { id: String(id), counterpartyId },
            relations: ['contacts'],
        });
        if (!record) throw new UserInputError(`TradingPoint not found or access denied`);
        const primary = record.contacts?.find(c => c.isPrimary) ?? record.contacts?.[0];
        input = normalizeCustomerInput(input, {
            address: record.address,
            contactName: primary?.name ?? null,
            contactPhone: primary?.phone ?? null,
        });
        const location = resolveTradingPointLocation(input, record);
        if (!record.customerOwned) {
            return this.proposeCustomerEdit(ctx, record, primary, input, location);
        }
        record.name = input.name;
        record.address = input.address;
        record.latitude = location.latitude;
        record.longitude = location.longitude;
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

    // An ERP-confirmed point is not edited by the customer directly: the edit waits for a manager.
    // The delivery comment is the customer's own note and applies at once.
    private async proposeCustomerEdit(
        ctx: RequestContext,
        record: TradingPoint,
        primary: ContactPerson | undefined,
        input: CustomerTradingPointInput,
        location: { latitude: number; longitude: number },
    ): Promise<TradingPoint> {
        const proposed: ProposedPointFields = {
            name: input.name,
            address: input.address,
            latitude: location.latitude,
            longitude: location.longitude,
            workingHours: input.workingHours ?? null,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
        };
        const contactChanged =
            input.contactName !== undefined &&
            ((input.contactName ?? null) !== (primary?.name ?? null) ||
                (input.contactPhone ?? null) !== (primary?.phone ?? null));
        const changed =
            proposed.name !== record.name ||
            proposed.address !== record.address ||
            proposed.latitude !== record.latitude ||
            proposed.longitude !== record.longitude ||
            proposed.workingHours !== record.workingHours ||
            contactChanged;
        const repo = this.connection.getRepository(ctx, TradingPoint);
        record.deliveryComment = input.deliveryComment ?? null;
        const saved = await repo.save(record);
        if (changed) {
            await savePendingChange(
                this.connection.getRepository(ctx, TradingPointChange),
                { id: String(record.id), counterpartyId: record.counterpartyId },
                proposed,
                ctx.activeUserId ? String(ctx.activeUserId) : null,
            );
        }
        Logger.verbose(`Customer proposed an edit of trading point ${record.id}`, loggerCtx);
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
    latitude?: number | null;
    longitude?: number | null;
}

function normalizeCustomerInput(
    input: CustomerTradingPointInput,
    current?: { address: string; contactName: string | null; contactPhone: string | null },
): CustomerTradingPointInput {
    const unchanged: ContactField[] = [];
    if (input.address.trim() === current?.address) unchanged.push('address');
    if ((input.contactName?.trim() || null) === current?.contactName) unchanged.push('contactName');
    if ((input.contactPhone?.trim() || null) === current?.contactPhone)
        unchanged.push('contactPhone');
    const error = validateTradingPointContact(input, unchanged);
    if (error) throw new UserInputError(error);
    return {
        ...input,
        name: input.name.trim(),
        address: input.address.trim(),
        contactName: input.contactName?.trim() || null,
        contactPhone: unchanged.includes('contactPhone')
            ? (current?.contactPhone ?? null)
            : input.contactPhone
              ? normalizePhone(input.contactPhone)
              : null,
    };
}
