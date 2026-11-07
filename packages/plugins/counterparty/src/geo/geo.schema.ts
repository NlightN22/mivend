import gql from 'graphql-tag';

export const geoSchema = gql`
    type AddressSuggestion {
        address: String!
        latitude: Float
        longitude: Float
    }

    type GeoProviderInfo {
        key: String!
        publicKey: String
    }

    type GeoConfig {
        providers: [GeoProviderInfo!]!
        defaultProvider: String
        defaultLatitude: Float
        defaultLongitude: Float
        defaultZoom: Int
    }

    extend type Query {
        searchAddress(
            query: String!
            biasLatitude: Float
            biasLongitude: Float
            provider: String
        ): [AddressSuggestion!]!
        reverseGeocode(latitude: Float!, longitude: Float!, provider: String): String
        geoConfig: GeoConfig!
    }
`;
