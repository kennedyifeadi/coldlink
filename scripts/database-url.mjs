// Reads DATABASE_URL for the database scripts, which load it from apps/api/.env. Nothing should
// print the URL, but maskSecrets hides it and its password in case an error message does.
export function readDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Add it to apps/api/.env.');
    process.exit(1);
  }
  return databaseUrl;
}

export function secretMasker(databaseUrl) {
  const { password } = new URL(databaseUrl);
  const secrets = [databaseUrl, password, decodeURIComponent(password)].filter(Boolean);
  return (text) => secrets.reduce((masked, secret) => masked.replaceAll(secret, '***'), text);
}
