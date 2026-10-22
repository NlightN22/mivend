import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { GRANTS, VIS_PASSWORD, actorEmail, grantJustification, type GrantKey } from './plan';

// Pending discount grant requests, one per price type class; specs find them by their justification.
export async function seedGrants(superadmin: string): Promise<void> {
    const day = 24 * 3600 * 1000;
    for (const key of Object.keys(GRANTS) as GrantKey[]) {
        const grant = GRANTS[key];
        const token =
            grant.by === 'superadmin'
                ? superadmin
                : await adminTokenFor(actorEmail(grant.by), VIS_PASSWORD);
        await adminGql(
            `mutation($i: DiscountGrantInput!) { requestDiscountGrant(input: $i) { id } }`,
            {
                i: {
                    priceTypeCode: grant.code,
                    percent: 1,
                    validFrom: new Date().toISOString(),
                    validTo: new Date(Date.now() + 3650 * day).toISOString(),
                    justification: grantJustification(key),
                },
            },
            token,
        );
    }
}
