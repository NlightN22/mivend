import { test, expect, type Page } from '@playwright/test';

const SUGGESTION = 'Stub avenue 15, building 2';

async function openEditForm(page: Page): Promise<ReturnType<Page['locator']>> {
    await page.route('**/admin-api', async route => {
        const body = route.request().postDataJSON() as { query?: string } | null;
        if (!body?.query?.includes('suggestAddress')) return route.fallback();
        return route.fulfill({ json: { data: { suggestAddress: [SUGGESTION] } } });
    });
    await page.goto('/customers?search=E2E%20Co');
    const customerRow = page.getByRole('row').filter({ hasText: 'E2E Co' }).first();
    await customerRow.waitFor({ timeout: 15000 });
    await customerRow.getByRole('link', { name: /E2E Co/ }).click();
    await expect(page).toHaveURL(/\/customers\/.+/);
    await page
        .locator('li', { hasText: 'E2E Trading Point' })
        .getByRole('button', { name: 'Edit' })
        .click();
    const form = page.locator('.tp-edit-form');
    await expect(form).toBeVisible();
    return form;
}

// #352: nothing here is saved, so the shared seed stays as it is.
test('the trading point form shows field errors after blur and does not save invalid values @on:manager-department-head @read-only', async ({
    page,
}) => {
    const saves: string[] = [];
    page.on('request', req => {
        if (
            req.url().includes('/admin-api') &&
            req.postData()?.includes('updateTradingPointDetails')
        )
            saves.push(req.postData() ?? '');
    });
    const form = await openEditForm(page);
    const [nameInput, addressInput] = await form.getByRole('textbox').all();

    await nameInput.fill('');
    await nameInput.blur();
    await expect(form.getByText('Enter the trading point name')).toBeVisible();

    await addressInput.fill('Somewhere');
    await addressInput.blur();
    await expect(
        form.getByText('Enter a full address with a street and building number'),
    ).toBeVisible();

    await form.getByRole('button', { name: '+ Add contact' }).click();
    await form.getByPlaceholder('Name').last().fill('Ivan');
    await form.getByPlaceholder('Name').last().blur();
    await expect(form.getByText('Enter the first and last name')).toBeVisible();
    await form.getByPlaceholder('Phone').last().fill('+7 (91');
    await form.getByPlaceholder('Phone').last().blur();
    await expect(form.getByText('Enter a full phone number')).toBeVisible();
    await form.getByPlaceholder('Email').last().fill('not-an-email');
    await form.getByPlaceholder('Email').last().blur();
    await expect(form.getByText('Enter a valid e-mail address')).toBeVisible();

    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(form).toBeVisible();
    expect(saves).toEqual([]);
});

test('the trading point address offers suggestions and working hours offer presets @on:manager-department-head @read-only', async ({
    page,
}) => {
    const form = await openEditForm(page);
    const addressInput = form.getByRole('textbox').nth(1);
    await addressInput.fill('Stub');
    await form.getByRole('option', { name: SUGGESTION }).click();
    await expect(addressInput).toHaveValue(SUGGESTION);

    await expect(form.locator('datalist option').first()).toBeAttached();
});
