const postgres = require('postgres');
require('dotenv').config();

let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL environment variable. Please check your Vercel and local environment settings.");
}

// Strip any accidental surrounding quotes that might have been pasted into Vercel dashboard
if ((connectionString.startsWith('"') && connectionString.endsWith('"')) || 
    (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
  connectionString = connectionString.slice(1, -1);
}

// Ensure the connection string is actually a valid Postgres URL
if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
  throw new Error(`Invalid database connection string format. Must start with "postgres://" or "postgresql://". Received: ${connectionString.substring(0, 15)}...`);
}

// Initialize Postgres connection
// 'ssl: require' is typically mandatory for querying Supabase/Neon from remote environments like Vercel.
const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const sql = postgres(connectionString, {
  ssl: isLocalhost ? false : 'require',
});

module.exports = { sql };
