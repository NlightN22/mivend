import gql from 'graphql-tag';

export const geoSchema = gql`
    type AddressSuggestion {
        address: String!
        latitude: Float
        longitude: Float
    }

    type GeoConfig {
        provider: String
        publicKey: String
        defaultLatitude: Float
        defaultLongitude: Float
        defaultZoom: Int
    }

    extend type Query {
        searchAddress(
            query: String!
            biasLatitude: Float
            biasLongitude: Float
        ): [AddressSuggestion!]!
        reverseGeocode(latitude: Float!, longitude: Float!): String
        geoConfig: GeoConfig!
    }
`;
