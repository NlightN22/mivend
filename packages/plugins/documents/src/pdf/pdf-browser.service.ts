import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from '@vendure/core';
import puppeteer, { Browser } from 'puppeteer';

import { loggerCtx } from '../constants';

// One persistent Chromium instance per worker process, launched once and reused
// for every render — never one browser per request/job. Mirrors the
// OnModuleInit/OnModuleDestroy lifecycle used by
// packages/plugins/sync/src/rabbitmq.service.ts for its persistent AMQP connection.
@Injectable()
export class PdfBrowserService implements OnModuleInit, OnModuleDestroy {
    private browser: Browser | null = null;

    async onModuleInit(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--disable-dev-shm-usage', '--no-sandbox'],
        });
        Logger.verbose('Puppeteer browser launched', loggerCtx);
    }

    async onModuleDestroy(): Promise<void> {
        await this.browser?.close();
        this.browser = null;
    }

    requireBrowser(): Browser {
        if (!this.browser) {
            throw new Error('PdfBrowserService: browser is not initialized');
        }
        return this.browser;
    }

    async renderPdf(html: string): Promise<Buffer> {
        const page = await this.requireBrowser().newPage();
        try {
            await page.setContent(html, { waitUntil: 'load' });
            const pdf = await page.pdf({ format: 'A4', printBackground: true });
            return Buffer.from(pdf);
        } finally {
            await page.close();
        }
    }
}
