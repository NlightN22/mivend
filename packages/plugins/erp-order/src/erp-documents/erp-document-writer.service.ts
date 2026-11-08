import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { shouldApplyDocument, withAggregateLock } from 'shared';
import type { FindOptionsWhere } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import type { ErpDocumentBase, ErpLineBase } from './erp-document-base';

// Keeps one insert below the 65535 bind-parameter limit for the widest line table.
const LINE_CHUNK = 500;

export type ErpHeaderFields<H extends ErpDocumentBase> = Partial<Omit<H, keyof ErpDocumentBase>>;
export type ErpLineRow<L extends ErpLineBase> = Partial<Omit<L, 'id' | 'documentId'>>;

export interface ErpLineSet<L extends ErpLineBase = ErpLineBase> {
    target: new () => L;
    rows: ErpLineRow<L>[];
}

export interface ErpDocumentWrite<H extends ErpDocumentBase> {
    target: new () => H;
    erpId: string;
    version: string;
    isDeleted: boolean;
    // false for a tombstone with an empty body: only the flag changes and the stored data stays.
    hasBody: boolean;
    sourceUpdatedAt: Date | null;
    fields: ErpHeaderFields<H>;
    lines: ErpLineSet[];
}

export type ErpDocumentResult = 'applied' | 'stale' | 'unknown-deleted';

@Injectable()
export class ErpDocumentWriter {
    constructor(private readonly connection: TransactionalConnection) {}

    write<H extends ErpDocumentBase>(
        ctx: RequestContext,
        input: ErpDocumentWrite<H>,
    ): Promise<ErpDocumentResult> {
        const key = `erp-document:${input.target.name}:${input.erpId}`;
        return withAggregateLock(this.connection, ctx, key, txCtx => this.apply(txCtx, input));
    }

    private async apply<H extends ErpDocumentBase>(
        ctx: RequestContext,
        input: ErpDocumentWrite<H>,
    ): Promise<ErpDocumentResult> {
        const repo = this.connection.getRepository(ctx, input.target);
        const where = { erpId: input.erpId } as FindOptionsWhere<H>;
        const existing = await repo.findOne({ where });
        const tombstoneOnly = input.isDeleted && !input.hasBody;
        if (!existing && tombstoneOnly) return 'unknown-deleted';
        const stored = existing
            ? { version: existing.sourceVersion, isDeleted: existing.isDeleted }
            : null;
        if (!shouldApplyDocument({ version: input.version, isDeleted: input.isDeleted }, stored)) {
            return 'stale';
        }
        const flags = {
            isDeleted: input.isDeleted,
            sourceVersion: input.version,
            sourceUpdatedAt: input.sourceUpdatedAt,
        };
        if (existing && tombstoneOnly) {
            await repo.update(existing.id, flags as unknown as QueryDeepPartialEntity<H>);
            return 'applied';
        }
        const values = {
            ...input.fields,
            ...flags,
            erpId: input.erpId,
        } as unknown as QueryDeepPartialEntity<H>;
        let documentId: number;
        if (existing) {
            await repo.update(existing.id, values);
            documentId = existing.id;
        } else {
            const inserted = await repo.insert(values);
            documentId = Number(inserted.identifiers[0].id);
        }
        await this.replaceLines(ctx, documentId, input.lines);
        return 'applied';
    }

    private async replaceLines(
        ctx: RequestContext,
        documentId: number,
        sets: ErpLineSet[],
    ): Promise<void> {
        for (const set of sets) {
            const repo = this.connection.getRepository(ctx, set.target);
            await repo.delete({ documentId } as FindOptionsWhere<ErpLineBase>);
            for (let i = 0; i < set.rows.length; i += LINE_CHUNK) {
                const chunk = set.rows
                    .slice(i, i + LINE_CHUNK)
                    .map(row => ({ ...row, documentId }));
                await repo.insert(chunk as QueryDeepPartialEntity<ErpLineBase>[]);
            }
        }
    }
}
