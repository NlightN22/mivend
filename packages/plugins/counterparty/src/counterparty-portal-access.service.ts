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
import { ctxQuery, withAggregateLock } from 'shared';
import { withInnBindingGuard } from './counterparty-inn-guard';
import { ContactPointService } from './contact-point.service';
import { PortalAccessPreconditionError } from './portal-access-precondition';

export { PortalAccessPreconditionError };

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

// The e-mail and phone come from the contact storage (legacy columns only as fallback), never entered here.
@Injectable()
export class CounterpartyPortalAccessService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private accessScopeService: AccessScopeService,
        private contactPoints: ContactPointService,
    ) {}

    async findPortalUsers(ctx: RequestContext, counterpartyId: ID): Promise<Customer[]> {
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);

        // Raw SQL: the link lives in a JSONB custom-field column, not a TypeORM-mapped relation.
        // QueryBuilder dot-path filters can't traverse it.
        const rows = await ctxQuery<Array<{ id: ID }>>(
            this.connection,
            ctx,
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

    // Each change is applied and reported independently: one bad row must not block the batch.
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

    // Revokes by counterparty under the same lock as activation, so a revoke cannot race a grant.
    async revoke(ctx: RequestContext, counterpartyId: ID): Promise<Customer> {
        const counterparty = await this.findCounterpartyOrFail(ctx, counterpartyId);
        await this.accessScopeService.assertCounterpartyWritable(ctx, counterparty);
        return withAggregateLock(
            this.connection,
            ctx,
            `portal-access:${counterpartyId}`,
            async txCtx => {
                const linkedCustomerId = await this.getLinkedCustomerId(txCtx, counterpartyId);
                if (!linkedCustomerId) {
                    throw new PortalAccessPreconditionError(
                        'no_portal_access',
                        `Counterparty ${counterpartyId} has no linked portal Customer to deactivate`,
                    );
                }
                return this.doDeactivate(txCtx, linkedCustomerId);
            },
        );
    }

    async linkedCustomerId(ctx: RequestContext, counterpartyId: ID): Promise<ID | null> {
        return this.getLinkedCustomerId(ctx, counterpartyId);
    }

    // The lock serializes the linked-customer check with the create, so two activations cannot both link.
    private doActivate(ctx: RequestContext, counterparty: Counterparty): Promise<Customer> {
        return withAggregateLock(
            this.connection,
            ctx,
            `portal-access:${counterparty.id}`,
            async txCtx => {
                const contact = await this.assertActivatable(txCtx, counterparty);
                return withInnBindingGuard(this.connection, txCtx, counterparty, guarded =>
                    this.createLinkedCustomer(guarded, counterparty, contact),
                );
            },
        );
    }

    private async assertActivatable(
        ctx: RequestContext,
        counterparty: Counterparty,
    ): Promise<{ email: string; phone: string }> {
        if (!counterparty.isActive) {
            throw new PortalAccessPreconditionError(
                'inactive',
                `Counterparty ${counterparty.id} is inactive in the ERP — portal access cannot be activated`,
            );
        }
        const chosen = (await this.contactPoints.chosenContacts(ctx, [counterparty.id])).get(
            String(counterparty.id),
        );
        if (!chosen?.phone || !chosen.email) {
            throw new PortalAccessPreconditionError(
                'no_contact',
                `Counterparty ${counterparty.id} is missing a usable phone and/or e-mail — both are required before portal access can be activated`,
            );
        }
        const existingCustomerId = await this.getLinkedCustomerId(ctx, counterparty.id);
        if (existingCustomerId) {
            throw new PortalAccessPreconditionError(
                'already_active',
                `Counterparty ${counterparty.id} already has a linked portal Customer (id=${existingCustomerId})`,
            );
        }
        return { email: chosen.email, phone: chosen.phone };
    }

    private async createLinkedCustomer(
        ctx: RequestContext,
        counterparty: Counterparty,
        contact: { email: string; phone: string },
    ): Promise<Customer> {
        // Password is omitted on purpose: Customer.create publishes AccountRegistrationEvent instead.
        // The counterparty sets their own password later via the storefront reset-link flow.
        const result = await this.customerService.create(ctx, {
            emailAddress: contact.email,
            firstName: counterparty.fullName ?? '',
            lastName: '',
            phoneNumber: contact.phone,
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
        const result = await ctxQuery<Array<{ id: ID }>>(
            this.connection,
            ctx,
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
