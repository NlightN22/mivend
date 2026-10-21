import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentPdfController } from '../../document-pdf.controller';
import { DocumentFieldResolver } from '../../documents.resolver';
import type { Document } from '../../entities/document.entity';

const UUID = '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
const ctx = {} as RequestContext;
const doc = { id: 7, uuid: UUID, number: '100-01-1' } as unknown as Document;
const access = { findDownloadable: vi.fn() };
const storage = { read: vi.fn() };
const generator = { generateNow: vi.fn() };
const controller = new DocumentPdfController(access as never, storage as never, generator as never);

function response(): Response & { set: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
    return { set: vi.fn(), send: vi.fn() } as never;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('DocumentPdfController', () => {
    it('sends a visible PDF with pdf content type and an attachment name from the number', async () => {
        access.findDownloadable.mockResolvedValue(doc);
        storage.read.mockResolvedValue(Buffer.from('%PDF'));
        const res = response();
        await controller.download(ctx, UUID, res);
        expect(res.set).toHaveBeenCalledWith(
            expect.objectContaining({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="100-01-1.pdf"',
                'Cache-Control': 'private, no-store',
            }),
        );
        expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF'));
        expect(generator.generateNow).not.toHaveBeenCalled();
    });

    it('answers 404 without touching storage when the document is hidden or missing', async () => {
        access.findDownloadable.mockResolvedValue(null);
        await expect(controller.download(ctx, UUID, response())).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(storage.read).not.toHaveBeenCalled();
    });

    it('renders a file that predates private storage on first download', async () => {
        access.findDownloadable.mockResolvedValue(doc);
        storage.read.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('%PDF'));
        const res = response();
        await controller.download(ctx, UUID, res);
        expect(generator.generateNow).toHaveBeenCalledWith(7);
        expect(res.send).toHaveBeenCalled();
    });

    it('answers 404 when the render fails to produce a file', async () => {
        access.findDownloadable.mockResolvedValue(doc);
        storage.read.mockResolvedValue(null);
        await expect(controller.download(ctx, UUID, response())).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('Document.pdfUrl', () => {
    const resolver = new DocumentFieldResolver();
    const field = (over: Partial<Document>): string | null =>
        resolver.pdfUrl({ uuid: UUID, source: 'generated', status: 'ready', ...over } as Document);

    it('points a ready generated document at the authorized endpoint by uuid', () => {
        expect(field({})).toBe(`/document-pdf/${UUID}`);
    });

    it('is null before the PDF is ready and for ERP documents', () => {
        expect(field({ status: 'generating' })).toBeNull();
        expect(field({ source: 'erp' })).toBeNull();
    });
});
