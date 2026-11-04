import { testDatabaseUrl } from './testDatabase.js';

export default function setup(): void {
  if (testDatabaseUrl() === undefined) {
    console.warn(
      'TEST_DATABASE_URL is not set, so the integration tests are skipped. Point it at a ' +
        'throwaway database on localhost with the migrations applied to run them.',
    );
  }
}
