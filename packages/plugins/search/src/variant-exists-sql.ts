// The shop view requires an organization (the seller of record); staff see every enabled variant.
export function variantExistsSql(requireOrganization: boolean): string {
    const organization = requireOrganization
        ? ' AND v."customFieldsOrganizationid" IS NOT NULL'
        : '';
    return `EXISTS (SELECT 1 FROM product_variant v WHERE v."productId" = product.id AND v."deletedAt" IS NULL AND v.enabled = true${organization})`;
}
