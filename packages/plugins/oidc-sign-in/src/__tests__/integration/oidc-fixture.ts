import { DataSource } from 'typeorm';
import type { ConfigService, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OidcIdentityService } from '../../oidc-identity.service';
import { OidcRequestStoreService } from '../../oidc-request-store.service';
import { OidcSessionTokenStoreService } from '../../oidc-session-token-store.service';

const DDL = `
    CREATE TABLE "user" (id serial PRIMARY KEY, identifier varchar NOT NULL, "deletedAt" timestamp);
    CREATE TABLE administrator (id serial PRIMARY KEY, "userId" int UNIQUE, "emailAddress" varchar NOT NULL, "deletedAt" timestamp);
    CREATE TABLE authentication_method (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        type varchar NOT NULL, strategy varchar, "externalIdentifier" varchar, metadata text, "userId" int);
    CREATE UNIQUE INDEX uq_oidc_subject ON authentication_method ("externalIdentifier") WHERE strategy = 'oidc';
    CREATE UNIQUE INDEX uq_oidc_user ON authentication_method ("userId") WHERE strategy = 'oidc';
    CREATE TABLE oidc_auth_request (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "stateHash" varchar NOT NULL UNIQUE, nonce varchar NOT NULL, "codeVerifier" varchar NOT NULL,
        status varchar NOT NULL, "userId" varchar, "expiresAt" timestamptz NOT NULL);
    CREATE TABLE oidc_session_token (
        id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        uuid uuid NOT NULL UNIQUE, "userId" int NOT NULL UNIQUE, "idToken" text NOT NULL);
    CREATE TABLE session (
        id serial PRIMARY KEY, token varchar NOT NULL UNIQUE, expires timestamp NOT NULL,
        invalidated boolean NOT NULL DEFAULT false, "authenticationStrategy" varchar, "userId" int);
`;

export interface OidcFixture {
    dataSource: DataSource;
    connection: TransactionalConnection;
    identity: OidcIdentityService;
    requests: OidcRequestStoreService;
    tokens: OidcSessionTokenStoreService;
    addAdmin(email: string, opts?: { identifier?: string; deleted?: boolean }): Promise<string>;
    linkedSubs(): Promise<Array<{ userId: string; sub: string }>>;
    reset(): Promise<void>;
    close(): Promise<void>;
}

export const ctx = { apiType: 'admin' } as never;

export async function openOidcFixture(tag: string): Promise<OidcFixture> {
    const { schema, extra } = testSchemaOptions(tag);
    await createTestSchema(schema);
    const dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(DDL);
    const connection = createTestConnection(dataSource);
    const config = {
        authOptions: { superadminCredentials: { identifier: 'superadmin' } },
    } as unknown as ConfigService;
    return {
        dataSource,
        connection,
        identity: new OidcIdentityService(connection, config),
        tokens: new OidcSessionTokenStoreService(connection),
        requests: new OidcRequestStoreService(connection, {
            requestTtlMs: 60_000,
            verifiedTtlMs: 60_000,
        } as never),
        addAdmin: async (email, opts = {}) => {
            const [{ id }] = await dataSource.query(
                `INSERT INTO "user" (identifier, "deletedAt") VALUES ($1, $2) RETURNING id`,
                [opts.identifier ?? email, opts.deleted ? new Date() : null],
            );
            await dataSource.query(
                `INSERT INTO administrator ("userId", "emailAddress", "deletedAt") VALUES ($1, $2, $3)`,
                [id, email, opts.deleted ? new Date() : null],
            );
            return String(id);
        },
        linkedSubs: () =>
            dataSource.query(
                `SELECT "userId"::text AS "userId", "externalIdentifier" AS sub FROM authentication_method ORDER BY id`,
            ),
        reset: async () => {
            await dataSource.query(
                'TRUNCATE "user", administrator, authentication_method, oidc_auth_request, oidc_session_token, session RESTART IDENTITY',
            );
        },
        close: async () => {
            await dataSource.destroy();
            await dropTestSchema(schema);
        },
    };
}
