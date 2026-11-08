import { MigrationInterface, QueryRunner } from 'typeorm';

// #335: devices an account has signed in from, and the per-user switch for the new-device e-mail.
export class SessionPolicy1791565000000 implements MigrationInterface {
    name = 'SessionPolicy1791565000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "known_device" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "uuid" uuid NOT NULL, "userId" character varying NOT NULL, "deviceHash" character varying NOT NULL, "label" character varying NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_171dbcb4a77c6a7266851eaed2d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_ba918a7d172aba468d591cb6f6" ON "known_device" ("uuid")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f636702ef8cd47b48b8ac073dc" ON "known_device" ("userId", "deviceHash")`,
        );
        await queryRunner.query(
            `ALTER TABLE "user" ADD "customFieldsNewdeviceemailenabled" boolean NOT NULL DEFAULT true`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user" DROP COLUMN "customFieldsNewdeviceemailenabled"`,
        );
        await queryRunner.query(`DROP TABLE "known_device"`);
    }
}
