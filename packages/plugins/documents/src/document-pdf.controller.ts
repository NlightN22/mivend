import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { DocumentPdfAccessService } from './document-pdf-access.service';
import { DocumentPdfStorageService } from './pdf/document-pdf-storage.service';
import { PdfGeneratorService } from './pdf/pdf-generator.service';

@ApiTags('Documents')
@Controller('document-pdf')
export class DocumentPdfController {
    constructor(
        private access: DocumentPdfAccessService,
        private storage: DocumentPdfStorageService,
        private generator: PdfGeneratorService,
    ) {}

    // Public at the guard: every refusal (guest, hidden, missing) must be the same 404.
    @Get(':uuid')
    @Allow(Permission.Public)
    @ApiOperation({ summary: 'Download the PDF of a generated document visible to the caller' })
    @ApiParam({ name: 'uuid', example: '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f' })
    @ApiProduces('application/pdf')
    @ApiResponse({ status: 200, description: 'The PDF file.' })
    @ApiResponse({ status: 404, description: 'No such document visible to the caller.' })
    async download(
        @Ctx() ctx: RequestContext,
        @Param('uuid') uuid: string,
        @Res() res: Response,
    ): Promise<void> {
        const document = await this.access.findDownloadable(ctx, uuid);
        if (!document) throw new NotFoundException();
        let pdf = await this.storage.read(document.uuid);
        // Files predating private storage are rendered on first download.
        if (!pdf) {
            await this.generator.generateNow(document.id);
            pdf = await this.storage.read(document.uuid);
        }
        if (!pdf) throw new NotFoundException();
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(document.number)}.pdf"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(pdf);
    }
}
