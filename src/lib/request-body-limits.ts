// Keep these budgets local to the affected routes; readJson's default stays 32 KiB.
// 16 answers × (2,000 UTF-16 code units + 40-character question ID) × 6 bytes
// for JSON \uXXXX escaping, plus acknowledgments, versions and the JSON envelope.
export const registrationBodyLimit = 256 * 1024;

// 4,096 UUIDs × (36 characters × 6 escaped bytes + quotes/comma) is 897,024
// bytes. Leave room for command/version fields, including escaped property names.
export const draftCommandBodyLimit = 1024 * 1024;
