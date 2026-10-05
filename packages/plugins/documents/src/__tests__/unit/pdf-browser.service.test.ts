import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('puppeteer', () => ({ default: { launch } }));

import { PdfBrowserService } from '../../pdf/pdf-browser.service';

function makeBrowser(pdfGate?: Promise<void>) {
    const page = {
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn(async () => {
            await pdfGate;
            return new Uint8Array([1, 2]);
        }),
        close: vi.fn().mockResolvedValue(undefined),
    };
    const handlers: Record<string, () => void> = {};
    return {
        page,
        connected: true,
        handlers,
        isConnected() {
            return this.connected;
        },
        on: vi.fn((event: string, handler: () => void) => {
            handlers[event] = handler;
        }),
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
    };
}

describe('PdfBrowserService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        launch.mockReset();
        process.env.PDF_BROWSER_IDLE_MS = '1000';
    });
    afterEach(() => {
        vi.useRealTimers();
        delete process.env.PDF_BROWSER_IDLE_MS;
    });

    it('does not launch on construction or destroy', async () => {
        const service = new PdfBrowserService();
        expect('onModuleInit' in service).toBe(false);
        await service.onModuleDestroy();
        expect(launch).not.toHaveBeenCalled();
    });

    it('launches once on first render and reuses the browser', async () => {
        launch.mockResolvedValue(makeBrowser());
        const service = new PdfBrowserService();
        await service.renderPdf('<p>a</p>');
        await service.renderPdf('<p>b</p>');
        expect(launch).toHaveBeenCalledTimes(1);
    });

    it('shares one launch between concurrent first renders', async () => {
        launch.mockResolvedValue(makeBrowser());
        const service = new PdfBrowserService();
        await Promise.all([service.renderPdf('a'), service.renderPdf('b')]);
        expect(launch).toHaveBeenCalledTimes(1);
    });

    it('retries the launch after a failure', async () => {
        launch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(makeBrowser());
        const service = new PdfBrowserService();
        await expect(service.renderPdf('a')).rejects.toThrow('boom');
        await expect(service.renderPdf('a')).resolves.toBeInstanceOf(Buffer);
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('closes the idle browser and relaunches on the next render', async () => {
        const first = makeBrowser();
        launch.mockResolvedValueOnce(first).mockResolvedValueOnce(makeBrowser());
        const service = new PdfBrowserService();
        await service.renderPdf('a');
        await vi.advanceTimersByTimeAsync(1000);
        expect(first.close).toHaveBeenCalledTimes(1);
        await service.renderPdf('b');
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('does not close the browser while a render is in flight', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        const browser = makeBrowser(gate);
        launch.mockResolvedValue(browser);
        const service = new PdfBrowserService();
        const inFlight = service.renderPdf('a');
        await vi.advanceTimersByTimeAsync(5000);
        expect(browser.close).not.toHaveBeenCalled();
        release();
        await inFlight;
        await vi.advanceTimersByTimeAsync(1000);
        expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('relaunches after a disconnect event and ignores a stale disconnect of an old browser', async () => {
        const first = makeBrowser();
        const second = makeBrowser();
        launch.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
        const service = new PdfBrowserService();
        await service.renderPdf('a');
        first.handlers.disconnected();
        await service.renderPdf('b');
        expect(launch).toHaveBeenCalledTimes(2);
        first.handlers.disconnected();
        await service.renderPdf('c');
        expect(launch).toHaveBeenCalledTimes(2);
        expect(second.newPage).toHaveBeenCalledTimes(2);
    });

    it('relaunches when the cached browser reports it is not connected', async () => {
        const first = makeBrowser();
        launch.mockResolvedValueOnce(first).mockResolvedValueOnce(makeBrowser());
        const service = new PdfBrowserService();
        await service.renderPdf('a');
        first.connected = false;
        await service.renderPdf('b');
        expect(launch).toHaveBeenCalledTimes(2);
    });

    it('surfaces the original render error when page.close also fails', async () => {
        const browser = makeBrowser();
        browser.page.setContent.mockRejectedValue(new Error('render failed'));
        browser.page.close.mockRejectedValue(new Error('close failed'));
        launch.mockResolvedValue(browser);
        const service = new PdfBrowserService();
        await expect(service.renderPdf('a')).rejects.toThrow('render failed');
    });

    it('waits for in-flight renders on destroy, then closes after a bounded timeout', async () => {
        const gate = new Promise<void>(() => undefined);
        const browser = makeBrowser(gate);
        launch.mockResolvedValue(browser);
        const service = new PdfBrowserService();
        void service.renderPdf('a').catch(() => undefined);
        await vi.advanceTimersByTimeAsync(0);
        const destroying = service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(9000);
        expect(browser.close).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1500);
        await destroying;
        expect(browser.close).toHaveBeenCalledTimes(1);
    });
});
