import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocumentPdfStorageService } from '../../pdf/document-pdf-storage.service';

const UUID = '6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
let dir: string;
let storage: DocumentPdfStorageService;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'document-pdfs-'));
    storage = new DocumentPdfStorageService({ pdfDir: path.join(dir, 'nested') });
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('DocumentPdfStorageService', () => {
    it('stores the file under the document uuid, never the number', async () => {
        await storage.write(UUID, Buffer.from('%PDF-1'));
        expect(await readdir(path.join(dir, 'nested'))).toEqual([`${UUID}.pdf`]);
        expect((await storage.read(UUID))?.toString()).toBe('%PDF-1');
    });

    it('overwrites a re-rendered file and reads null once removed', async () => {
        await storage.write(UUID, Buffer.from('v1'));
        await storage.write(UUID, Buffer.from('v2'));
        expect((await storage.read(UUID))?.toString()).toBe('v2');
        await storage.remove(UUID);
        await storage.remove(UUID);
        expect(await storage.read(UUID)).toBeNull();
    });

    it('rejects anything that is not a uuid, so no path can escape the directory', async () => {
        await expect(storage.read('../../etc/passwd')).rejects.toThrow('Invalid document uuid');
        await expect(storage.write('100-01-1', Buffer.from('x'))).rejects.toThrow();
    });
});
