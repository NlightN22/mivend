#!/usr/bin/env node
// Manual/exploratory Playwright driver for the manager portal (packages/manager) — NOT part of
// the real e2e suite (`make e2e`, driven by playwright.config.ts's testDir/testMatch, which only
// picks up `**/*.spec.ts` under ./manager and ./storefront). This is a throwaway-script
// replacement: a fast way to log in, navigate, screenshot, and inspect the live dev server during
// a session, without hand-writing the login/navigation boilerplate each time. See this directory's
// own package.json for why this resolves `@playwright/test` (it must run with this file, or a
// script that requires it, physically under packages/e2e — Node resolves bare specifiers relative
// to the *importing file's* location, not cwd, so this can't live under packages/manager itself).
//
// Usage (from repo root or anywhere — invoke via `node packages/e2e/manual-driver.mjs ...`):
//   node packages/e2e/manual-driver.mjs --path /orders --screenshot /tmp/out.png
//   node packages/e2e/manual-driver.mjs --path /customers/1 --account manager --wait 2000
//
// See this skill's SKILL.md (packages/manager/.claude/skills/run-manager/SKILL.md) for the full
// account list, dev-stack prerequisites, and deeper CDP-based debugging techniques for "click
// does nothing" style bugs that this script alone won't diagnose.

import { chromium } from '@playwright/test';

const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';

// Seeded by `make seed-access-roles && make seed` — same accounts packages/e2e's own
// global-setup.ts logs in with. Password is identical for all four.
const ACCOUNTS = {
    operator: { username: 'ivan.operator@mivend.dev', password: 'Password123!' },
    manager: { username: 'petr.manager@mivend.dev', password: 'Password123!' },
    departmentHead: { username: 'olga.depthead@mivend.dev', password: 'Password123!' },
    portalAdmin: { username: 'anna.portaladmin@mivend.dev', password: 'Password123!' },
};

function parseArgs(argv) {
    const args = {
        path: '/',
        screenshot: null,
        account: 'portalAdmin',
        width: 1440,
        height: 900,
        wait: 1000,
        fullPage: true,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--path') args.path = argv[++i];
        else if (a === '--screenshot') args.screenshot = argv[++i];
        else if (a === '--account') args.account = argv[++i];
        else if (a === '--wait') args.wait = Number(argv[++i]);
        else if (a === '--width') args.width = Number(argv[++i]);
        else if (a === '--height') args.height = Number(argv[++i]);
        else if (a === '--viewport-only') args.fullPage = false;
    }
    return args;
}

async function login(page, accountKey) {
    const creds = ACCOUNTS[accountKey] ?? ACCOUNTS.portalAdmin;
    await page.goto(`${MANAGER_URL}/login`);
    await page.locator('input[type="text"]').fill(creds.username);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!ACCOUNTS[args.account]) {
        console.error(`Unknown --account "${args.account}". Options: ${Object.keys(ACCOUNTS).join(', ')}`);
        process.exit(1);
    }

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
    const logs = [];
    page.on('console', msg => {
        if (msg.type() === 'error') logs.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', err => logs.push(`pageerror: ${err.message}`));

    await login(page, args.account);
    await page.goto(`${MANAGER_URL}${args.path}`);
    await page.waitForTimeout(args.wait);

    if (args.screenshot) {
        await page.screenshot({ path: args.screenshot, fullPage: args.fullPage });
        console.log(`screenshot saved to ${args.screenshot}`);
    }

    console.log(logs.length ? `console/page errors:\n${logs.join('\n')}` : 'no console/page errors');

    await browser.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
