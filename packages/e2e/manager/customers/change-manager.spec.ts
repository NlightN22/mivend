import { test, expect, type Page } from '@playwright/test';

async function adminApiViaPage<T>(
    page: Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await page.request.post('/admin-api', { data: { query, variables } });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

const MANAGER_OF = `query($id: ID!) { counterparty(id: $id) { assignedManagerId } }`;
const REASSIGN = `mutation($cid: ID!, $aid: ID!) { reassignCounterpartyManager(counterpartyId: $cid, administratorId: $aid) { id } }`;

// The card's change is the bulk operation with one record (#366); the head holds the right and sees the button.
test('the customer card changes the manager through a confirmation that names both managers (#366) @on:manager-department-head', async ({
    page,
}) => {
    const list = await adminApiViaPage<{
        counterparties: {
            items: { id: string; erpId: string; assignedManagerId: string | null }[];
        };
    }>(
        page,
        `query { counterparties(options: { take: 200 }) { items { id erpId assignedManagerId } } }`,
    );
    const counterparty = list.counterparties.items.find(c => c.erpId === 'e2e-cnt-001');
    if (!counterparty?.assignedManagerId) throw new Error('e2e-cnt-001 has no manager');
    const original = counterparty.assignedManagerId;

    await page.goto(`/customers/${counterparty.id}`);
    await page.getByTestId('change-manager').click();
    await page.getByTestId('change-manager-target').selectOption({ index: 1 });
    await expect(page.getByTestId('change-manager-confirm')).toContainText('E2E Co');
    try {
        await page.getByTestId('change-manager-apply').click();
        await expect
            .poll(
                async () =>
                    (
                        await adminApiViaPage<{ counterparty: { assignedManagerId: string } }>(
                            page,
                            MANAGER_OF,
                            { id: counterparty.id },
                        )
                    ).counterparty.assignedManagerId,
                { timeout: 30000 },
            )
            .not.toBe(original);
    } finally {
        await adminApiViaPage(page, REASSIGN, { cid: counterparty.id, aid: original });
    }
});
