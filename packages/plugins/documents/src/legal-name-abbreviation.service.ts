import { randomUUID } from 'crypto';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EntityNotFoundError,
    ListQueryBuilder,
    ListQueryOptions,
    Logger,
    PaginatedList,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { getPageAndCount, withAggregateLock } from 'shared';
import { QueryFailedError } from 'typeorm';

import { loggerCtx } from './constants';
import { LegalNameAbbreviation } from './entities/legal-name-abbreviation.entity';
import { DEFAULT_LEGAL_NAME_ABBREVIATIONS } from './qr-payment/default-legal-name-abbreviations';
import {
    normalizePhrase,
    type LegalNameAbbreviationRule,
} from './qr-payment/legal-name-abbreviation';
import {
    cleanAbbreviationInput,
    type LegalNameAbbreviationInput,
} from './qr-payment/legal-name-abbreviation-input';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class LegalNameAbbreviationService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        try {
            await this.provisionDefaults(RequestContext.empty());
        } catch (err) {
            Logger.error(
                `Failed to provision legal name abbreviations: ${err instanceof Error ? err.message : String(err)}`,
                loggerCtx,
            );
        }
    }

    // Only into an empty table: the last row cannot be deleted, so staff edits are never overwritten.
    async provisionDefaults(ctx: RequestContext): Promise<number> {
        const repo = this.connection.getRepository(ctx, LegalNameAbbreviation);
        if ((await repo.count()) > 0) return 0;
        const result = await repo
            .createQueryBuilder()
            .insert()
            .values(
                DEFAULT_LEGAL_NAME_ABBREVIATIONS.map(rule => ({
                    uuid: randomUUID(),
                    phrase: rule.phrase,
                    abbreviation: rule.abbreviation,
                    phraseKey: normalizePhrase(rule.phrase).toLowerCase(),
                })),
            )
            .orIgnore()
            .execute();
        return result.identifiers.length;
    }

    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<LegalNameAbbreviation>,
    ): Promise<PaginatedList<LegalNameAbbreviation>> {
        const qb = this.listQueryBuilder.build(LegalNameAbbreviation, options ?? {}, {
            ctx,
            orderBy: { phrase: 'ASC' },
        });
        return getPageAndCount(qb, options?.take, options?.skip);
    }

    async findRules(ctx: RequestContext): Promise<LegalNameAbbreviationRule[]> {
        // unbounded-ok: a few dozen staff-edited rows, loaded once per render
        const rows = await this.connection.getRepository(ctx, LegalNameAbbreviation).find();
        return rows.map(row => ({ phrase: row.phrase, abbreviation: row.abbreviation }));
    }

    async create(
        ctx: RequestContext,
        input: LegalNameAbbreviationInput,
    ): Promise<LegalNameAbbreviation> {
        const value = this.clean(input);
        return this.saveUnique(() =>
            this.connection.getRepository(ctx, LegalNameAbbreviation).save(
                new LegalNameAbbreviation({
                    uuid: randomUUID(),
                    ...value,
                    phraseKey: value.phrase.toLowerCase(),
                }),
            ),
        );
    }

    async update(
        ctx: RequestContext,
        id: ID,
        input: LegalNameAbbreviationInput,
    ): Promise<LegalNameAbbreviation> {
        const value = this.clean(input);
        const repo = this.connection.getRepository(ctx, LegalNameAbbreviation);
        const row = await repo.findOne({ where: { id } });
        if (!row) throw new EntityNotFoundError('LegalNameAbbreviation', id);
        row.phrase = value.phrase;
        row.abbreviation = value.abbreviation;
        row.phraseKey = value.phrase.toLowerCase();
        return this.saveUnique(() => repo.save(row));
    }

    async delete(ctx: RequestContext, id: ID): Promise<void> {
        await withAggregateLock(
            this.connection,
            ctx,
            'legal-name-abbreviation:delete',
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, LegalNameAbbreviation);
                if (!(await repo.findOne({ where: { id } })))
                    throw new EntityNotFoundError('LegalNameAbbreviation', id);
                if ((await repo.count()) <= 1)
                    throw new UserInputError(
                        'The last abbreviation cannot be deleted; edit it instead',
                    );
                await repo.delete(id);
            },
        );
    }

    private clean(input: LegalNameAbbreviationInput): LegalNameAbbreviationInput {
        const cleaned = cleanAbbreviationInput(input);
        if (!cleaned.ok) throw new UserInputError(cleaned.problems.join('; '));
        return cleaned.value;
    }

    private async saveUnique<T>(save: () => Promise<T>): Promise<T> {
        try {
            return await save();
        } catch (err) {
            if (
                err instanceof QueryFailedError &&
                (err.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
            ) {
                throw new UserInputError('This phrase already has an abbreviation');
            }
            throw err;
        }
    }
}
