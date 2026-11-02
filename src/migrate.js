import 'dotenv/config';
import { closeDatabase, runMigrations } from './database.js';

try {
  await runMigrations();
  console.log('Migracje PostgreSQL zakończone.');
} catch (error) {
  console.error('Migracje PostgreSQL nie powiodły się:', error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
