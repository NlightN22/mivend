import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger } from '@vendure/core';
import puppeteer, { Browser } from 'puppeteer';

import { loggerCtx } from '../constants';

const DEFAULT_IDLE_MS = 5 * 60 * 1000;
const DESTROY_DRAIN_MS = 10_000;

function readIdleMs(): number {
    const parsed = Number(process.env.PDF_BROWSER_IDLE_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_MS;
}

// Chromium is launched lazily on the first render and closed after an idle period,
// so only processes that actually render PDFs ever hold a browser.
@Injectable()
export class PdfBrowserService implements OnModuleDestroy {
    private browserPromise: Promise<Browser> | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private activeRenders = 0;

    async onModuleDestroy(): Promise<void> {
        this.clearIdleTimer();
        const deadline = Date.now() + DESTROY_DRAIN_MS;
        while (this.activeRenders > 0 && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await this.closeBrowser();
    }

    async renderPdf(html: string): Promise<Buffer> {
        this.clearIdleTimer();
        this.activeRenders++;
        try {
            const browser = await this.getBrowser();
            const page = await browser.newPage();
            try {
                await page.setContent(html, { waitUntil: 'load' });
                const pdf = await page.pdf({ format: 'A4', printBackground: true });
                return Buffer.from(pdf);
            } finally {
                await page
                    .close()
                    .catch(err =>
                        Logger.verbose(`Failed to close PDF page: ${String(err)}`, loggerCtx),
                    );
            }
        } finally {
            this.activeRenders--;
            if (this.activeRenders === 0) {
                this.armIdleTimer();
            }
        }
    }

    private async getBrowser(): Promise<Browser> {
        const current = this.browserPromise;
        if (current) {
            const browser = await current.catch(() => null);
            if (browser && !browser.isConnected() && this.browserPromise === current) {
                this.browserPromise = null;
            }
        }
        if (!this.browserPromise) {
            const launch = puppeteer
                .launch({
                    headless: true,
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    args: ['--disable-dev-shm-usage', '--no-sandbox'],
                })
                .then(browser => {
                    browser.on('disconnected', () => {
                        if (this.browserPromise === launch) {
                            this.browserPromise = null;
                            this.clearIdleTimer();
                        }
                    });
                    Logger.verbose('Puppeteer browser launched', loggerCtx);
                    return browser;
                });
            this.browserPromise = launch;
            launch.catch(() => {
                if (this.browserPromise === launch) {
                    this.browserPromise = null;
                }
            });
        }
        return this.browserPromise;
    }

    private async closeBrowser(): Promise<void> {
        const pending = this.browserPromise;
        this.browserPromise = null;
        if (pending) {
            await (await pending.catch(() => null))?.close();
        }
    }

    private armIdleTimer(): void {
        this.clearIdleTimer();
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            if (this.activeRenders === 0) {
                void this.closeBrowser().catch(err =>
                    Logger.warn(`Failed to close idle browser: ${String(err)}`, loggerCtx),
                );
            }
        }, readIdleMs());
        this.idleTimer.unref();
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}
