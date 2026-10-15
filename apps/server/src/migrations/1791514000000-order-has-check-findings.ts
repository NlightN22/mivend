import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderHasCheckFindings1791514000000 implements MigrationInterface {
    name = 'OrderHasCheckFindings1791514000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsHascheckfindings" boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `UPDATE "order" o SET "customFieldsHascheckfindings" = true
              WHERE EXISTS (SELECT 1 FROM check_result cr
                             WHERE cr."subjectType" = 'order' AND cr."subjectId" = o.id::text)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsHascheckfindings"`,
        );
    }
}
