import { expect, type Page } from '@playwright/test';

export interface SidebarBlock {
    back: string[];
    current: string | null;
    level: string[];
}

const NAV = '.mv-category-nav';

const texts = async (page: Page, selector: string): Promise<string[]> =>
    (await page.locator(selector).allTextContents()).map(t => t.trim());

export async function readSidebar(page: Page): Promise<SidebarBlock> {
    await expect(page.locator(NAV)).toBeVisible({ timeout: 10_000 });
    const [current] = await texts(page, `${NAV} .mv-category-nav__item--current`);
    const buttons = await texts(
        page,
        `${NAV} button.mv-category-nav__item:not(.mv-category-nav__more)`,
    );
    const back = await texts(page, `${NAV} .mv-category-nav__back`);
    return { back, current: current ?? null, level: buttons.slice(back.length) };
}

export const OILS_EXPECTED: SidebarBlock = {
    back: ['Engine'],
    current: 'Engine Oils',
    level: ['Mineral Oils', 'Semi-Synthetic Oils', 'Synthetic Oils'],
};

export const MINERAL_EXPECTED: SidebarBlock = {
    back: ['Engine', 'Engine Oils'],
    current: 'Mineral Oils',
    level: ['Semi-Synthetic Oils', 'Synthetic Oils'],
};
