import { MigrationInterface, QueryRunner } from 'typeorm';

export class StorageLocationAssignment1791442158601 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "storage_location_assignment" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityId" character varying NOT NULL, "productId" character varying NOT NULL, "organizationErpId" character varying NOT NULL, "priority" integer NOT NULL DEFAULT '0', "id" SERIAL NOT NULL, CONSTRAINT "PK_0d5845148ae72e7fdd6d6f81837" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_b68a5b9b4b283ae47a4b0a3c55" ON "storage_location_assignment" ("entityId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ed7656d5fa59ed5ede2b7fe97b" ON "storage_location_assignment" ("productId") `,
            undefined,
        );
        // Seed the current winners so a later event for another location compares against them.
        await queryRunner.query(
            `INSERT INTO "storage_location_assignment" ("entityId", "productId", "organizationErpId", "priority")
             SELECT DISTINCT ON (pv."customFieldsOrganizationsourceentityid")
                 pv."customFieldsOrganizationsourceentityid", p."customFieldsExternalid", o."erpId",
                 COALESCE(pv."customFieldsOrganizationpriority", 0)
             FROM product_variant pv
             INNER JOIN product p ON p.id = pv."productId"
             INNER JOIN organization_requisites o ON o.id = pv."customFieldsOrganizationid"
             WHERE pv."customFieldsOrganizationsourceentityid" IS NOT NULL
               AND p."customFieldsExternalid" IS NOT NULL
             ORDER BY pv."customFieldsOrganizationsourceentityid"`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "storage_location_assignment"`, undefined);
    }
}
