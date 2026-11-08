import type { Page } from '@playwright/test';

const GRID = '.mv-advanced-data-table__grid';

// Minor units are dropped: only the order of the integer parts matters for a sort check.
export function parseMoney(text: string): number {
    const negative = /[-−–]/.test(text);
    const whole = text.replace(/[.,]\d{1,2}(?!\d)\D*$/, '').replace(/\D/g, '');
    return whole === '' ? NaN : (negative ? -1 : 1) * Number(whole);
}

export async function readAmounts(page: Page): Promise<number[]> {
    const headers = await page.locator(`${GRID} thead th`).allInnerTexts();
    const column = headers.findIndex(h => /Amount/.test(h));
    if (column < 0) return [];
    const cells = await page
        .locator(`${GRID} tbody tr td:nth-child(${column + 1})`)
        .allInnerTexts();
    return cells.map(parseMoney);
}

export const isSorted = (values: number[], dir: 'ASC' | 'DESC'): boolean =>
    values.length > 0 &&
    values.every(
        (v, i) =>
            !Number.isNaN(v) &&
            (i === 0 || (dir === 'ASC' ? values[i - 1] <= v : values[i - 1] >= v)),
    );
