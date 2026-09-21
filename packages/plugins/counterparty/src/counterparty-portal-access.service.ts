import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Customer,
    CustomerService,
    Logger,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';
import { loggerCtx } from './types';

export type PortalAccessAction = 'activate' | 'deactivate';

export interface PortalAccessChangeInput {
    counterpartyId: ID;
    action: PortalAccessAction;
}

export interface PortalAccessChangeResult {
    counterpartyId: ID;
    success: boolean;
    error: string | null;
    customerId: ID | null;
}

// Issue #120, Decisions 1/2/5/7. Note the fields this validates (phone/officialEmail) are
// ERP-sourced (event-contracts@0.39.0's CounterpartyChanged via CounterpartyStreamHandler,
// issue #131) — NOT manually entered on the detail page as #120's own Decision 6 originally
// said. That decision is stale; #133 already flagged the same correction for its own read-only
// display of these fields. Nothing here writes phone/officialEmail — only reads them as the
// activation gate.
@Injectable()
export class CounterpartyPortalAccessService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private accessScopeService: AccessScopeService,
    ) {}

    async findPortalUsers(ctx: RequestContext, counterpartyId: ID): Promise<Customer[]> {
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        // Raw SQL for the same reason CounterpartyService.getForCustomer/getLinkedCustomerId
        // use it: a JSONB custom-field column, not a real TypeORM-mapped relation you can
        // filter through QueryBuilder's dot-path syntax.
        const rows: Array<{ id: ID }> = await this.connection.rawConnection.query(
            `SELECT cu.id AS id FROM customer cu
             WHERE cu."customFieldsCounterpartyid"::text = $1
             ORDER BY cu."createdAt" ASC`,
            [String(counterpartyId)],
        );
        if (rows.length === 0) return [];
        const repo = this.connection.getRepository(ctx, Customer);
        const customers = await Promise.all(
            rows.map(row => repo.findOne({ where: { id: row.id }, withDeleted: true })),
        );
        return customers.filter((c): c is Customer => c != null);
    }

    async activate(ctx: RequestContext, counterpartyId: ID): Promise<Customer> {
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);
        return this.doActivate(ctx, counterparty);
    }

    async deactivate(ctx: RequestContext, customerId: ID): Promise<Customer> {
        const customer = await this.connection
            .getRepository(ctx, Customer)
            .findOne({ where: { id: customerId } });
        if (!customer) {
            throw new UserInputError(`Customer not found: id=${customerId}`);
        }
        const counterpartyId = (
            customer.customFields as { counterpartyId?: string | null } | undefined
        )?.counterpartyId;
        if (counterpartyId) {
            const counterparty = await this.connection
                .getRepository(ctx, Counterparty)
                .findOne({ where: { id: counterpartyId } });
            if (counterparty) {
                await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);
            }
        }
        return this.doDeactivate(ctx, customerId);
    }

    // Decision "one real batch mutation (not N sequential calls)" — each change is applied and
    // reported independently so one bad row (missing data, already linked, out of scope) never
    // blocks the rest of the batch, matching the concept's per-row pending-state UI.
    async applyBatch(
        ctx: RequestContext,
        changes: PortalAccessChangeInput[],
    ): Promise<PortalAccessChangeResult[]> {
        const results: PortalAccessChangeResult[] = [];
        for (const change of changes) {
            try {
                const counterparty = await this.findCounterpartyOrFail(ctx, change.counterpartyId);
                await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

                if (change.action === 'activate') {
                    const customer = await this.doActivate(ctx, counterparty);
                    results.push({
                        counterpartyId: change.counterpartyId,
                        success: true,
                        error: null,
                        customerId: customer.id,
                    });
                } else {
                    const linkedCustomerId = await this.getLinkedCustomerId(
                        ctx,
                        change.counterpartyId,
                    );
                    if (!linkedCustomerId) {
                        throw new UserInputError(
                            `Counterparty ${change.counterpartyId} has no linked portal Customer to deactivate`,
                        );
                    }
                    const customer = await this.doDeactivate(ctx, linkedCustomerId);
                    results.push({
                        counterpartyId: change.counterpartyId,
                        success: true,
                        error: null,
                        customerId: customer.id,
                    });
                }
            } catch (e) {
                results.push({
                    counterpartyId: change.counterpartyId,
                    success: false,
                    error: e instanceof Error ? e.message : String(e),
                    customerId: null,
                });
            }
        }
        return results;
    }

    private async doActivate(ctx: RequestContext, counterparty: Counterparty): Promise<Customer> {
        if (!counterparty.isActive) {
            throw new UserInputError(
                `Counterparty ${counterparty.id} is inactive in the ERP — portal access cannot be activated`,
            );
        }
        if (!counterparty.phone || !counterparty.officialEmail) {
            throw new UserInputError(
                `Counterparty ${counterparty.id} is missing phone and/or officialEmail — both are required before portal access can be activated`,
            );
        }
        const existingCustomerId = await this.getLinkedCustomerId(ctx, counterparty.id);
        if (existingCustomerId) {
            throw new UserInputError(
                `Counterparty ${counterparty.id} already has a linked portal Customer (id=${existingCustomerId})`,
            );
        }

        // Password omitted on purpose (issue #120 Decision 7) — Customer.create publishes
        // AccountRegistrationEvent instead of immediately verifying, so the counterparty sets
        // their own password later via the storefront-side reset-link flow. No plaintext
        // password is ever generated, seen, or set by staff.
        const result = await this.customerService.create(ctx, {
            emailAddress: counterparty.officialEmail,
            firstName: counterparty.legalName,
            lastName: '',
            phoneNumber: counterparty.phone,
            customFields: {
                counterpartyId: counterparty.id,
                portalRole: 'client_admin',
            } as Record<string, unknown>,
        });

        if ('errorCode' in result) {
            throw new UserInputError(`${result.errorCode}: ${result.message}`);
        }

        Logger.verbose(
            `Activated portal access for counterparty=${counterparty.id} (customer=${result.id})`,
            loggerCtx,
        );
        return result;
    }

    private async doDeactivate(ctx: RequestContext, customerId: ID): Promise<Customer> {
        await this.customerService.softDelete(ctx, customerId);
        Logger.verbose(`Deactivated portal access for customer=${customerId}`, loggerCtx);
        const deactivated = await this.connection
            .getRepository(ctx, Customer)
            .findOne({ where: { id: customerId }, withDeleted: true });
        if (!deactivated) {
            throw new UserInputError(`Customer not found after deactivation: id=${customerId}`);
        }
        return deactivated;
    }

    private async getLinkedCustomerId(ctx: RequestContext, counterpartyId: ID): Promise<ID | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT cu.id AS id FROM customer cu
             WHERE cu."customFieldsCounterpartyid"::text = $1 AND cu."deletedAt" IS NULL`,
            [String(counterpartyId)],
        );
        return result[0]?.id ?? null;
    }

    private async findCounterpartyOrFail(
        ctx: RequestContext,
        counterpartyId: ID,
    ): Promise<Counterparty> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { id: counterpartyId } });
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: id=${counterpartyId}`);
        }
        return counterparty;
    }
}
