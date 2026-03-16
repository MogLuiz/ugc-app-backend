import { AppDataSource } from './data-source';

async function run() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
  console.log('Migrations executadas com sucesso.');
}

run().catch((err) => {
  console.error('Erro nas migrations:', err);
  process.exit(1);
});
