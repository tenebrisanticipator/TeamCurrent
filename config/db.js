const dns = require('dns');
const postgres = require('postgres');
require('dotenv').config();

// Prefer IPv4 results to avoid environments where IPv6 is unreachable (ENETUNREACH).
if (typeof dns.setDefaultResultOrder === 'function') {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (err) {
    console.warn('Could not set DNS result order to ipv4first:', err.message);
  }
}

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

// Initialize Postgres connection. If the host resolves to both IPv6 and IPv4,
// Node now prefers IPv4, avoiding ENETUNREACH in IPv6-only routing environments.
const sql = postgres(process.env.DATABASE_URL);

module.exports = { sql };
