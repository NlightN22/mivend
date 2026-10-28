import { MigrationInterface, QueryRunner } from 'typeorm';

// #296: filter-mode setups are evaluated lazily from normalised terms; the server reclassifies stored rows at start.
export class SetupFilterTerms1791539000000 implements MigrationInterface {
    name = 'SetupFilterTerms1791539000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "discount_setup_filter_term" ("setupId" integer NOT NULL, "side" character varying NOT NULL, "position" integer NOT NULL, "field" character varying NOT NULL, "hierarchical" boolean NOT NULL, "negated" boolean NOT NULL, "refs" jsonb NOT NULL, CONSTRAINT "PK_discount_setup_filter_term" PRIMARY KEY ("setupId", "side", "position"))`,
        );
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "retro_bonus_rule_filter_term" ("ruleId" integer NOT NULL, "side" character varying NOT NULL, "position" integer NOT NULL, "field" character varying NOT NULL, "hierarchical" boolean NOT NULL, "negated" boolean NOT NULL, "refs" jsonb NOT NULL, CONSTRAINT "PK_retro_bonus_rule_filter_term" PRIMARY KEY ("ruleId", "side", "position"))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "retro_bonus_rule_filter_term"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "discount_setup_filter_term"`);
    }
}
