import { shopApi } from './client';
import { ConfirmEmailAddressDocument } from './generated/graphql';

export async function confirmEmailAddress(token: string): Promise<boolean> {
    const { confirmEmailAddress: confirmed } = await shopApi(ConfirmEmailAddressDocument, {
        token,
    });
    return confirmed;
}
