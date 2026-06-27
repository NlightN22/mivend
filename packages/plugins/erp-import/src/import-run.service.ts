import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ImportRun } from './entities/import-run.entity';
import { ImportRunError } from './entities/import-run-error.entity';
import type { BatchImportBody, ImportRunResult } from './types';

@Injectable()
export class ImportRunService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async findByExchangeId(exchangeId: string): Promise<ImportRun | null> {
        return this.dataSource.getRepository(ImportRun).findOne({
            where: { exchangeId },
            relations: ['errors'],
        });
    }

    async createPending(body: BatchImportBody): Promise<ImportRun> {
        const run = this.dataSource.getRepository(ImportRun).create({
            exchangeId: body.exchangeId,
            status: 'pending',
            total: body.records.length,
            processed: 0,
            failed: 0,
            payload: body as unknown as object,
            finishedAt: null,
        });
        return this.dataSource.getRepository(ImportRun).save(run);
    }

    async markProcessing(run: ImportRun): Promise<void> {
        await this.dataSource.getRepository(ImportRun).update(run.id, { status: 'processing' });
    }

    async complete(
        run: ImportRun,
        processed: number,
        errors: Array<{ index: number; message: string }>,
    ): Promise<void> {
        const repo = this.dataSource.getRepository(ImportRun);
        const errorRepo = this.dataSource.getRepository(ImportRunError);

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
