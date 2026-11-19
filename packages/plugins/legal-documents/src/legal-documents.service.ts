import { Inject, Injectable } from '@nestjs/common';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { clientIp, SignInProtectionPlugin } from '@mivend/plugin-sign-in-protection';
import { getPageAndCount, withAggregateLock } from 'shared';
import { LessThanOrEqual } from 'typeorm';

import { documentStatuses } from './document-status';
import type { AcceptanceRecord, DocumentStatus } from './document-status';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { LEGAL_KIND_RULES, LEGAL_KINDS, isLegalKind } from './legal-kinds';
import { LEGAL_DOCUMENTS_OPTIONS } from './types';
import type { LegalDocumentsOptions } from './types';

export interface AcceptanceInput {
    kind: string;
    version: number;
    accepted: boolean;
}

const HISTORY_CEILING = 100;
// A handful of kinds times versions times languages; far above any real count.
const VERSION_CEILING = 500;

@Injectable()
export class LegalDocumentsService {
    constructor(
        private connection: TransactionalConnection,
        private customers: CustomerService,
        @Inject(LEGAL_DOCUMENTS_OPTIONS) private options: LegalDocumentsOptions,
    ) {}

    private async published(ctx: RequestContext): Promise<LegalDocumentVersion[]> {
        return this.connection
            .getRepository(ctx, LegalDocumentVersion)
            .find({ where: { effectiveDate: LessThanOrEqual(new Date()) }, take: VERSION_CEILING });
    }

    // The newest published text of a kind, in the requested language or the fallback one.
    async currentDocument(
        ctx: RequestContext,
        kind: string,
        locale?: string | null,
    ): Promise<LegalDocumentVersion | null> {
        const rows = (await this.published(ctx)).filter(row => row.kind === kind);
        if (rows.length === 0) return null;
        const latest = Math.max(...rows.map(row => row.version));
        const current = rows.filter(row => row.version === latest);
        return (
            current.find(row => row.locale === locale) ??
            current.find(row => row.locale === this.options.fallbackLocale) ??
            current[0]
        );
    }

    private async customerId(ctx: RequestContext): Promise<number | null> {
        if (!ctx.activeUserId) return null;
        const customer = await this.customers.findOneByUserId(ctx, ctx.activeUserId);
        return customer ? Number(customer.id) : null;
    }

    // The newest answer per kind is all the rules read.
    private async records(ctx: RequestContext, customerId: number): Promise<AcceptanceRecord[]> {
        return this.connection.getRepository(ctx, LegalAcceptance).query(
            `SELECT DISTINCT ON (kind) kind, version, accepted FROM legal_acceptance
             WHERE "customerId" = $1 ORDER BY kind, id DESC LIMIT $2`,
            [customerId, LEGAL_KINDS.length],
        );
    }

    // Staff and anonymous callers have nothing to accept.
    async statuses(ctx: RequestContext): Promise<DocumentStatus[]> {
        const customerId = await this.customerId(ctx);
        if (customerId === null) return [];
        return documentStatuses(await this.published(ctx), await this.records(ctx, customerId));
    }

    async history(
        ctx: RequestContext,
        skip = 0,
        take = HISTORY_CEILING,
    ): Promise<{ items: LegalAcceptance[]; totalItems: number }> {
        const customerId = await this.customerId(ctx);
        if (customerId === null) return { items: [], totalItems: 0 };
        const qb = this.connection
            .getRepository(ctx, LegalAcceptance)
            .createQueryBuilder('acceptance')
            .where('acceptance."customerId" = :customerId', { customerId })
            .orderBy('acceptance.id', 'DESC');
        return getPageAndCount(qb, Math.min(Math.max(1, take), HISTORY_CEILING), Math.max(0, skip));
    }

    async accept(
        ctx: RequestContext,
        inputs: AcceptanceInput[],
        locale?: string | null,
    ): Promise<DocumentStatus[]> {
        const customerId = await this.customerId(ctx);
        if (customerId === null) return [];
        const technical = this.technicalData(ctx);
        await withAggregateLock(
            this.connection,
            ctx,
            `legal-acceptance:${customerId}`,
            async tx => {
                const published = await this.published(tx);
                const records = await this.records(tx, customerId);
                for (const input of inputs) {
                    const row = {
                        customerId,
                        locale: locale || this.options.fallbackLocale,
                        ...technical,
                    };
                    await this.recordOne(tx, published, records, input, row);
                }
            },
        );
        return this.statuses(ctx);
    }

    private async recordOne(
        ctx: RequestContext,
        published: LegalDocumentVersion[],
        records: AcceptanceRecord[],
        input: AcceptanceInput,
        row: Pick<LegalAcceptance, 'customerId' | 'locale' | 'portal' | 'ip' | 'userAgent'>,
    ): Promise<void> {
        if (!isLegalKind(input.kind) || !LEGAL_KIND_RULES[input.kind].acceptable) {
            throw new UserInputError(`Legal document "${input.kind}" cannot be accepted`);
        }
        if (!input.accepted && LEGAL_KIND_RULES[input.kind].required) {
            throw new UserInputError(
                `Legal document "${input.kind}" is required and cannot be declined`,
            );
        }
        const versions = published.filter(row => row.kind === input.kind).map(row => row.version);
        if (versions.length === 0 || input.version !== Math.max(...versions)) {
            throw new UserInputError(
                `Legal document "${input.kind}" version ${input.version} is not current`,
            );
        }
        const latest = records.filter(r => r.kind === input.kind).at(-1);
        if (latest && latest.version === input.version && latest.accepted === input.accepted)
            return;
        await this.connection.getRepository(ctx, LegalAcceptance).save(
            new LegalAcceptance({
                ...row,
                kind: input.kind,
                version: input.version,
                accepted: input.accepted,
            }),
        );
        records.push({ kind: input.kind, version: input.version, accepted: input.accepted });
    }

    private technicalData(
        ctx: RequestContext,
    ): Pick<LegalAcceptance, 'portal' | 'ip' | 'userAgent'> {
        const req = ctx.req as { headers?: Record<string, unknown> } | undefined;
        const header = (name: string): string => String(req?.headers?.[name] ?? '').slice(0, 500);
        const hops = SignInProtectionPlugin.options?.throttle.trustedProxyHops ?? 1;
        let portal = ctx.apiType as string;
        try {
            portal = new URL(header('origin')).host || portal;
        } catch {
            // best-effort: a request without a valid Origin keeps the API type as the portal.
        }
        return { portal, ip: clientIp(ctx, hops), userAgent: header('user-agent') };
    }
}
