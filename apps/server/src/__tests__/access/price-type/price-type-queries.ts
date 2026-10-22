import { admin, staffToken } from '../harness/actors';
import { PRICED_PRODUCT } from '../seed/fixture-plan';

let variant: string | undefined;

// The variant carrying a price of every access price type and a purchase price.
export async function pricedVariant(): Promise<string> {
    if (variant) return variant;
    const result = await admin<{ productVariants: { items: { id: string }[] } }>(
        await staffToken('superadmin'),
        `query($s: String!) { productVariants(options: { filter: { sku: { eq: $s } } }) { items { id } } }`,
        { s: PRICED_PRODUCT.sku },
    );
    variant = result.data!.productVariants.items[0].id;
    return variant;
}

export const cents = (amount: number): number => Math.round(amount * 100);
