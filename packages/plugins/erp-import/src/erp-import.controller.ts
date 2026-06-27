import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '@vendure/core';
import { ErpAuthGuard } from './guards/erp-auth.guard';
import { ErpImportService } from './erp-import.service';
import { ImportRunService } from './import-run.service';
import type { BatchImportBody, ImportRunResult } from './types';

@Controller('erp')
@UseGuards(ErpAuthGuard)
export class ErpImportController {
    constructor(
        private readonly erpImportService: ErpImportService,
        private readonly importRunService: ImportRunService,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Post('import/batch')
    @HttpCode(200)
    async importBatch(
        @Req() req: Request,
        @Body() body: BatchImportBody,
    ): Promise<ImportRunResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        return this.erpImportService.processBatch(ctx, body);
    }

    @Get('import/runs/:exchangeId')
    async getRun(@Param('exchangeId') exchangeId: string): Promise<ImportRunResult | null> {
        const run = await this.importRunService.findByExchangeId(exchangeId);
        if (!run) return null;
        return this.importRunService.toResult(run);
    }
}
