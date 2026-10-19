import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ImportRun } from './entities/import-run.entity';
import { ImportRunError } from './entities/import-run-error.entity';
import type { BatchImportBody, ImportRunResult } from './types';

@Injectable()
export class ImportRunService {
    constructor(private readonly connection: TransactionalConnection) {}

    async findByExchangeId(ctx: RequestContext, exchangeId: string): Promise<ImportRun | null> {
        return this.connection.getRepository(ctx, ImportRun).findOne({
            where: { exchangeId },
            relations: ['errors'],
        });
    }

    async createPending(ctx: RequestContext, body: BatchImportBody): Promise<ImportRun> {
        const run = this.connection.getRepository(ctx, ImportRun).create({
            exchangeId: body.exchangeId,
            status: 'pending',
            total: body.records.length,
            processed: 0,
            failed: 0,
            payload: body as unknown as object,
            finishedAt: null,
        });
        return this.connection.getRepository(ctx, ImportRun).save(run);
    }

    async markProcessing(ctx: RequestContext, run: ImportRun): Promise<void> {
        await this.connection
            .getRepository(ctx, ImportRun)
            .update(run.id, { status: 'processing' });
    }

    async resetForRetry(ctx: RequestContext, run: ImportRun): Promise<void> {
        await this.connection.getRepository(ctx, ImportRunError).delete({ run: { id: run.id } });
        await this.connection.getRepository(ctx, ImportRun).update(run.id, {
            status: 'pending',
            processed: 0,
            failed: 0,
            finishedAt: null,
        });
    }

    async complete(
        ctx: RequestContext,
        run: ImportRun,
        processed: number,
        errors: Array<{ index: number; message: string }>,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, ImportRun);
        const errorRepo = this.connection.getRepository(ctx, ImportRunError);

        if (errors.length > 0) {
            const entities = errors.map(e =>
                errorRepo.create({ run, recordIndex: e.index, message: e.message }),
            );
            await errorRepo.save(entities);
        }

        await repo.update(run.id, {
            status: errors.length === run.total ? 'failed' : 'done',
            processed,
            failed: errors.length,
            finishedAt: new Date(),
        });
    }

    toResult(run: ImportRun): ImportRunResult {
        return {
            runId: run.id,
            exchangeId: run.exchangeId,
            status: run.status,
            total: run.total,
            processed: run.processed,
            failed: run.failed,
            errors: (run.errors ?? []).map(e => ({ index: e.recordIndex, message: e.message })),
            createdAt: run.createdAt.toISOString(),
            finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
        };
    }
}
