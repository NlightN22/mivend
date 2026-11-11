import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSettlementDocumentTypes } from '../../api/settlements';
import {
    resetDocumentTypeCodes,
    useDocumentTypeCodes,
} from '../../composables/useDocumentTypeCodes';
import { documentTypeVariant } from '../../utils/documentTypeVariant';

vi.mock('../../api/settlements', () => ({ fetchSettlementDocumentTypes: vi.fn() }));
const fetchMock = vi.mocked(fetchSettlementDocumentTypes);
const counts = (...codes: string[]): string[] => codes;

describe('useDocumentTypeCodes', () => {
    beforeEach(() => {
        resetDocumentTypeCodes();
        fetchMock.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('loads the sorted codes once; the hash covers a code until then', async () => {
        fetchMock.mockResolvedValue(counts('b', 'a'));
        const { codes, ensureLoaded } = useDocumentTypeCodes();
        expect(documentTypeVariant('a', codes.value)).toBe(documentTypeVariant('a'));
        ensureLoaded();
        ensureLoaded();
        await vi.waitFor(() => expect(codes.value).toEqual(['a', 'b']));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on the next call after a failure', async () => {
        fetchMock.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(counts('a'));
        const { codes, ensureLoaded } = useDocumentTypeCodes();
        ensureLoaded();
        await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
        ensureLoaded();
        await vi.waitFor(() => expect(codes.value).toEqual(['a']));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('drops the list on logout and ignores a response that arrives after it', async () => {
        let resolve: (v: ReturnType<typeof counts>) => void = () => undefined;
        fetchMock.mockReturnValueOnce(new Promise(r => (resolve = r)));
        const { codes, ensureLoaded } = useDocumentTypeCodes();
        ensureLoaded();
        resetDocumentTypeCodes();
        resolve(counts('stale'));
        await Promise.resolve();
        await Promise.resolve();
        expect(codes.value).toEqual([]);
        fetchMock.mockResolvedValueOnce(counts('fresh'));
        ensureLoaded();
        await vi.waitFor(() => expect(codes.value).toEqual(['fresh']));
    });
});
