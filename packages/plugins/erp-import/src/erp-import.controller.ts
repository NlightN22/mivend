import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestContextService } from '@vendure/core';
import { ErpAuthGuard } from './guards/erp-auth.guard';
import { ErpImportService } from './erp-import.service';
import { ImportRunService } from './import-run.service';
import type { BatchImportBody, ImportRunResult } from './types';
import { BatchImportRequestDto } from './dto/batch-import.dto';
import { ImportRunResultDto } from './dto/import-run-result.dto';

@ApiTags('ERP Import')
@ApiBearerAuth('erp-import-token')
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
    @ApiOperation({
        summary: 'Submit a batch of ERP records for import (idempotent by exchangeId)',
    })
    @ApiBody({ type: BatchImportRequestDto })
    @ApiResponse({ status: 200, type: ImportRunResultDto })
    async importBatch(
        @Req() req: Request,
        @Body() body: BatchImportRequestDto,
    ): Promise<ImportRunResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        // BatchImportRequestDto documents the envelope shape for Swagger; each
        // record's exact `data` shape is validated per-type inside
        // ErpImportService.processRecord (unrecognized `type` values are
        // silently skipped there, same as before this DTO existed) — safe to
        // treat the wider DTO shape as the strict internal union at this boundary.
        return this.erpImportService.processBatch(ctx, body as unknown as BatchImportBody);
    }

    @Get('import/runs/:exchangeId')
    @ApiOperation({ summary: 'Look up the status of a previously submitted import run' })
    @ApiParam({ name: 'exchangeId', description: 'The exchangeId used when submitting the batch' })
    @ApiResponse({ status: 200, type: ImportRunResultDto })
    async getRun(@Param('exchangeId') exchangeId: string): Promise<ImportRunResult | null> {
        const run = await this.importRunService.findByExchangeId(exchangeId);
        if (!run) return null;
        return this.importRunService.toResult(run);
    }
}
