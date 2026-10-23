import { adminGql } from '../helpers/api';

export async function ensureShippingMethod(token: string): Promise<void> {
    const { data } = await adminGql<{ shippingMethods: { items: { id: string }[] } }>(
        `query { shippingMethods { items { id } } }`,
        undefined,
        token,
    );
    if (data.shippingMethods.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateShippingMethodInput!) { createShippingMethod(input: $input) { id } }`,
        {
            input: {
                code: 'free-shipping',
                fulfillmentHandler: 'manual-fulfillment',
                checker: {
                    code: 'default-shipping-eligibility-checker',
                    arguments: [{ name: 'orderMinimum', value: '0' }],
                },
                calculator: {
                    code: 'default-shipping-calculator',
                    arguments: [
                        { name: 'rate', value: '0' },
                        { name: 'includesTax', value: 'auto' },
                        { name: 'taxRate', value: '0' },
                    ],
                },
                translations: [{ languageCode: 'en', name: 'Free Shipping', description: '' }],
            },
        },
        token,
    );
}

export async function ensureCountry(token: string, code: string, name: string): Promise<void> {
    const { data } = await adminGql<{ countries: { items: { id: string }[] } }>(
        `query($code: String!) { countries(options: { filter: { code: { eq: $code } } }) { items { id } } }`,
        { code },
        token,
    );
    if (data.countries.items.length > 0) return;
    await adminGql(
        `mutation($input: CreateCountryInput!) { createCountry(input: $input) { id } }`,
        { input: { code, translations: [{ languageCode: 'en', name }], enabled: true } },
        token,
    );
}
