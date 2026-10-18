import { expect, type Page } from '@playwright/test';
import { clearCart, gql } from '../storefront/orders/helpers';
import type { CartLine } from './cart-picker';

export async function addLine(
    page: Page,
    variantId: string,
    quantity: number,
): Promise<{ typename: string; quantity: number }> {
    const data = (await gql(
        page,
        `mutation($id: ID!, $q: Int!) { addItemToOrder(productVariantId: $id, quantity: $q) {
            __typename ... on Order { lines { quantity productVariant { id } } } ... on ErrorResult { message } } }`,
        { id: variantId, q: quantity },
    )) as {
        addItemToOrder: {
            __typename: string;
            lines?: { quantity: number; productVariant: { id: string } }[];
        };
    };
    const line = data.addItemToOrder.lines?.find(l => l.productVariant.id === variantId);
    return { typename: data.addItemToOrder.__typename, quantity: line?.quantity ?? 0 };
}

export async function fillCart(page: Page, lines: CartLine[]): Promise<void> {
    await clearCart(page);
    for (const line of lines) {
        const added = await addLine(page, line.variantId, line.quantity);
        if (added.typename !== 'Order' || added.quantity !== line.quantity) {
            throw new Error(
                `Cart refused variant ${line.variantId} x${line.quantity}: ${JSON.stringify(added)}`,
            );
        }
    }
}

const PLACE_ORDER = /^(Place order|Place order & get proforma invoice)$/;

export async function openCheckout(page: Page): Promise<void> {
    await page.goto('/checkout');
    await expect(page.getByRole('button', { name: PLACE_ORDER })).toBeEnabled({ timeout: 30_000 });
}

export async function placeOrderInCheckout(page: Page): Promise<string> {
    await openCheckout(page);
    await page.getByRole('button', { name: PLACE_ORDER }).click();
    await expect(page).toHaveURL(/\/order-created\?code=/, { timeout: 60_000 });
    const code = new URL(page.url()).searchParams.get('code');
    if (!code) throw new Error('order-created page has no order code');
    return code;
}

export async function cancelInStorefront(page: Page, orderId: string): Promise<void> {
    await page.goto(`/orders/${orderId}`);
    await page.getByRole('button', { name: 'Отменить заказ' }).click();
    await page.getByRole('button', { name: 'Да, отменить' }).click();
    await expect(page.getByRole('button', { name: 'Отменить заказ' })).toBeHidden({
        timeout: 30_000,
    });
}
