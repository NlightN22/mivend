import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

import { coreTypes } from './schema-types-core';
import { healthTypes } from './schema-types-health';
import { problemTypes } from './schema-types-problems';
import { reportTypes } from './schema-types-reports';
import { photoTypes } from './schema-types-photos';
import { operations } from './schema-operations';

export const adminApiExtensions: DocumentNode = gql`
    ${coreTypes}
    ${healthTypes}
    ${problemTypes}
    ${reportTypes}
    ${photoTypes}
    ${operations}
`;
