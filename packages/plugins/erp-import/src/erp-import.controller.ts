import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
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
        // No global ValidationPipe: @ApiProperty "required" is docs only, so check the envelope here.
        // exchangeId is the dedup idempotency key; empty records must fail, not create a vacuous done run.
        if (!body.exchangeId) {
            throw new BadRequestException('exchangeId is required');
        }
        if (!Array.isArray(body.records)) {
            throw new BadRequestException('records must be an array');
        }
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        // BatchImportRequestDto is Swagger-only; each record's data is validated in its type's handler.
        // Unknown types hit processRecord's switch default: rejected per record, never counted processed.
        return this.erpImportService.processBatch(ctx, body as unknown as BatchImportBody);
    }

    @Get('import/runs/:exchangeId')
    @ApiOperation({ summary: 'Look up the status of a previously submitted import run' })
    @ApiParam({ name: 'exchangeId', description: 'The exchangeId used when submitting the batch' })
    @ApiResponse({ status: 200, type: ImportRunResultDto })
    async getRun(
        @Req() req: Request,
        @Param('exchangeId') exchangeId: string,
    ): Promise<ImportRunResult | null> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        const run = await this.importRunService.findByExchangeId(ctx, exchangeId);
        if (!run) return null;
        return this.importRunService.toResult(run);
    }
}
