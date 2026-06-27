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

import { ContactPerson } from './entities/contact-person.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { loggerCtx } from './types';

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
    ) {}

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

    async findByCounterparty(ctx: RequestContext, counterpartyId: ID): Promise<TradingPoint[]> {
        return this.connection.getRepository(ctx, TradingPoint).find({
            where: { counterpartyId: String(counterpartyId), isActive: true },
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
