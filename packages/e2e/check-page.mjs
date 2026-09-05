#!/usr/bin/env node
// Ad hoc headless page check for Claude Code (not part of this package's own auth-gated
// Playwright test suite — see playwright.config.ts's projects for that; this is a quick "does
// this URL actually render" sanity check with no fixtures/storageState). See
// .claude/skills/check-page/SKILL.md.
//
// Usage (run from packages/e2e, or via `pnpm --filter @mivend/e2e exec node check-page.mjs ...`):
//   node check-page.mjs <url> [--wait-for=<css-selector>] [--out=<path>]

import { chromium } from '@playwright/test';

function parseArgs(argv) {
    const url = argv.find(a => !a.startsWith('--'));
    const waitFor = argv.find(a => a.startsWith('--wait-for='))?.split('=')[1];
    const out = argv.find(a => a.startsWith('--out='))?.split('=')[1] ?? 'page-check.png';
    if (!url) {
        console.error('Usage: check-page.mjs <url> [--wait-for=<css-selector>] [--out=<path>]');
        process.exit(1);
    }
    return { url, waitFor, out };
}

async function main() {
    const { url, waitFor, out } = parseArgs(process.argv.slice(2));

    const consoleMessages = [];
    const requestFailures = [];
    const networkErrors = [];

    const browser = await chromium.launch({
        // devof.komponent-m.ru has a real Let's Encrypt cert per docs/environments.md, but this
        // stays permissive so the same script also works against a bare localhost:port target.
        args: ['--ignore-certificate-errors'],
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('requestfailed', req =>
        requestFailures.push({ url: req.url(), failure: req.failure()?.errorText }),
    );
    page.on('response', res => {
        if (res.status() >= 400) {
            networkErrors.push({ url: res.url(), status: res.status() });
        }
    });

    let navError = null;
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
        if (waitFor) {
            await page.waitForSelector(waitFor, { timeout: 10_000 });
        }
    } catch (e) {
        navError = e instanceof Error ? e.message : String(e);
    }

    const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '(could not read body text)');
    await page.screenshot({ path: out, fullPage: true }).catch(() => {});

    await browser.close();

    console.log(
        JSON.stringify(
            {
                url,
                navError,
                bodyTextPreview: bodyText.slice(0, 800),
                consoleErrors: consoleMessages.filter(m => m.type === 'error'),
                requestFailures,
                networkErrors,
                screenshot: out,
            },
            null,
            2,
        ),
    );

    if (navError || requestFailures.length > 0) {
        process.exitCode = 1;
    }
}

main();
