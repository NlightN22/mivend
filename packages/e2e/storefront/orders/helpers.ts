import { type Page } from '@playwright/test';

const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:5173';

export async function gql(
    page: Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const res = await page.request.post(`${STOREFRONT}/shop-api`, {
        data: { query, variables },
        headers: { 'Content-Type': 'application/json' },
    });
    const body = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    return body.data ?? {};
}

export async function clearCart(page: Page): Promise<void> {
    // If order is not in AddingItems, transition back first
    await gql(
        page,
        `
        mutation {
            transitionOrderToState(state: "AddingItems") { __typename }
        }
    `,
    ).catch(() => {
        /* ignore if already in AddingItems or no active order */
    });
    await gql(page, 'mutation { removeAllOrderLines { __typename } }');
}

export async function searchInStock(page: Page): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const result = await gql(
                page,
                `
                query { search(input: { take: 1, inStock: true }) { items { productVariantId } } }
            `,
            );
            const items = (result.search as { items: { productVariantId: string }[] }).items;
            if (items.length) return items[0].productVariantId;
        } catch {
            // ES index may not be ready yet — wait and retry
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('No in-stock products found after retries');
}

export async function placeTestOrder(page: Page): Promise<{ id: string; code: string }> {
    await clearCart(page);

    const variantId = await searchInStock(page);

    await gql(
        page,
        `
        mutation AddItem($id: ID!) {
            addItemToOrder(productVariantId: $id, quantity: 1) { __typename }
        }
    `,
        { id: variantId },
    );

    await gql(
        page,
        `
        mutation SetAddress {
            setOrderShippingAddress(input: {
                fullName: "E2E Test",
                streetLine1: "Test Street 1",
                city: "Test City",
                countryCode: "RU"
            }) { __typename }
        }
    `,
    );

    const methodsData = await gql(
        page,
        `
        query { eligibleShippingMethods { id name } }
    `,
    );
    const methods = methodsData.eligibleShippingMethods as { id: string; name: string }[];
    if (methods.length > 0) {
        await gql(
            page,
            `
            mutation SetMethod($id: [ID!]!) {
                setOrderShippingMethod(shippingMethodId: $id) { __typename }
            }
        `,
            { id: [methods[0].id] },
        );
    }

    const transitionData = await gql(
        page,
        `
        mutation Transition($state: String!) {
            transitionOrderToState(state: $state) {
                __typename
                ... on Order { id code }
            }
        }
    `,
        { state: 'ArrangingPayment' },
    );
    const transitioned = transitionData.transitionOrderToState as { id?: string; code?: string };
    return { id: transitioned.id ?? '', code: transitioned.code ?? '' };
}
