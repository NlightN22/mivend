export const teamDirectorySdl = `
    enum TeamDirectoryStatus {
        active
        inactive
        unassigned
    }

    input TeamDirectoryFilter {
        departmentId: String
        branchId: String
        status: TeamDirectoryStatus
    }

    input TeamDirectoryListOptions {
        skip: Int
        take: Int
        search: String
        filter: TeamDirectoryFilter
    }

    type TeamDirectoryMember {
        id: ID!
        erpId: String
        firstName: String
        lastName: String
        active: Boolean!
        roleCodes: [String!]!
        departmentId: String
        departmentName: String
        branchId: String
        positionId: String
        position: String
    }

    type TeamDirectoryMemberList {
        items: [TeamDirectoryMember!]!
        totalItems: Int!
    }

    extend type Query {
        teamDirectory(options: TeamDirectoryListOptions): TeamDirectoryMemberList!
    }
`;
