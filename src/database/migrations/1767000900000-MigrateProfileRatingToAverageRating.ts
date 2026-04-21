import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renomeia `profiles.rating` → `profiles.average_rating` e adiciona `review_count`.
 *
 * Passos:
 * 1. Adiciona coluna `average_rating` com os dados existentes de `rating`.
 * 2. Adiciona coluna `review_count` com default 0.
 * 3. Remove a coluna `rating` antiga.
 *
 * Após esta migration, `Profile.averageRating` é a única fonte de verdade
 * para a reputação agregada; `rating` deixa de existir.
 */
export class MigrateProfileRatingToAverageRating1767000900000
  implements MigrationInterface
{
  name = 'MigrateProfileRatingToAverageRating1767000900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Nova coluna que preserva os dados existentes
    await queryRunner.query(`
      ALTER TABLE "profiles"
        ADD COLUMN "average_rating" NUMERIC(3,2) NOT NULL DEFAULT 0
    `);

    // 2. Copia os valores já existentes de `rating`
    await queryRunner.query(`
      UPDATE "profiles" SET "average_rating" = "rating"
    `);

    // 3. Contagem inicial de reviews — será 0 para todos (tabela reviews recém-criada)
    await queryRunner.query(`
      ALTER TABLE "profiles"
        ADD COLUMN "review_count" INT NOT NULL DEFAULT 0
    `);

    // 4. Remove coluna antiga
    await queryRunner.query(`
      ALTER TABLE "profiles" DROP COLUMN "rating"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profiles"
        ADD COLUMN "rating" NUMERIC(3,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "profiles" SET "rating" = "average_rating"
    `);
    await queryRunner.query(`
      ALTER TABLE "profiles" DROP COLUMN "review_count"
    `);
    await queryRunner.query(`
      ALTER TABLE "profiles" DROP COLUMN "average_rating"
    `);
  }
}
