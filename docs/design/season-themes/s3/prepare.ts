// Disposable test fixture only; never production seed.
import { assertTestDatabase } from "../../../../tests/database";
import { seedEditions } from "../../../../tests/fixtures/editions";
import { frostPreview } from "../../../../tests/fixtures/frost-preview";
import { closeDb } from "../../../../src/db";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
try {
  await seedEditions([frostPreview]);
} finally {
  await closeDb();
}
