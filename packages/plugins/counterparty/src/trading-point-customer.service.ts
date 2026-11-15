import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Logger, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { randomUUID } from 'crypto';
import { ctxQuery, normalizePhone, validateTradingPointContact, type ContactField } from 'shared';

import { ContactPerson } from './entities/contact-person.entity';
import { Counterparty } from './entities/counterparty.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointChange } from './entities/trading-point-change.entity';
import { savePendingChange, type ProposedPointFields } from './trading-point-change';
import { resolveTradingPointLocation } from './trading-point-location';
import { TradingPointVersionService } from './trading-point-version.service';
import { loggerCtx } from './types';

// Customer self-service writes; each committed change bumps the point version.
@Injectable()
export class TradingPointCustomerService {
    constructor(
        private connection: TransactionalConnection,
        private versions: TradingPointVersionService,
    ) {}

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
        saved.version = await this.versions.bump(ctx, saved.id);
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
        saved.version = await this.versions.bump(ctx, saved.id);
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
        const commentChanged = record.deliveryComment !== (input.deliveryComment ?? null);
        record.deliveryComment = input.deliveryComment ?? null;
        const saved = await repo.save(record);
        if (commentChanged) saved.version = await this.versions.bump(ctx, saved.id);
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
        if (record.customerStatus === 'hidden') return true;
        await repo.update({ id: String(id) }, { customerStatus: 'hidden' });
        await this.versions.bump(ctx, id);
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
        const changed = record.customerStatus !== 'active' || !record.isActive;
        await repo.update({ id: String(id) }, { customerStatus: 'active', isActive: true });
        if (changed) await this.versions.bump(ctx, id);
        const updated = await repo.findOne({ where: { id: String(id) }, relations: ['contacts'] });
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
