import { createHash } from 'crypto';

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

const EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

// A failure no retry can fix (expired link, wrong content); the photo needs a replay instead.
export class PermanentPhotoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PermanentPhotoError';
    }
}

export function photoFileName(contentHash: string, mimeType: string): string {
    const extension = EXTENSION_BY_MIME[mimeType];
    if (!extension) throw new PermanentPhotoError(`unsupported mime type ${mimeType}`);
    return `${contentHash}.${extension}`;
}

export async function downloadVerifiedPhoto(
    url: string,
    expectedHash: string,
    fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (response.status === 403 || response.status === 404 || response.status === 410) {
        throw new PermanentPhotoError(`download refused with HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`download failed with HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_PHOTO_BYTES) throw new PermanentPhotoError('file exceeds the size limit');
    const body = await readCapped(response);
    const actualHash = createHash('md5').update(body).digest('hex');
    if (actualHash !== expectedHash.toLowerCase()) {
        throw new PermanentPhotoError('content hash mismatch');
    }
    return body;
}

async function readCapped(response: Response): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > MAX_PHOTO_BYTES) throw new PermanentPhotoError('file exceeds the size limit');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
