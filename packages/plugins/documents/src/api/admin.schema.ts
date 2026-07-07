import { gql } from 'graphql-tag';

export const adminApiExtensions = gql`
    extend type Mutation {
        generateContract(counterpartyId: ID!): Boolean!
        # Logo is set here, never pushed via erp-import — see
        # OrganizationRequisites.logoAssetId for why. Upload the logo as a
        # regular Vendure Asset first (createAssets), then pass its id.
        setOrganizationLogo(erpId: String!, assetId: ID!): Boolean!
    }
`;
