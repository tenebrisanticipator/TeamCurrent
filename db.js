const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

// Initialize NeonDB connection.
// 'neon' function uses the DATABASE_URL connection string directly.
const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
