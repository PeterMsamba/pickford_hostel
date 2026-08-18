import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Support DATABASE_URL, DB_URL, or individual local parameters
const connectionString = 
    process.env.DATABASE_URL || 
    process.env.DB_URL || 
    `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

// Enable SSL whenever connecting to Render or remote hosts, regardless of NODE_ENV
const requiresSSL = 
    process.env.NODE_ENV === 'production' || 
    connectionString.includes('render.com') || 
    (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));

const pool = new Pool({
    connectionString,
    ssl: requiresSSL ? { rejectUnauthorized: false } : false
});

// Immediate database connection check on startup
pool.query('SELECT NOW()')
    .then((res) => {
        console.log('PostgreSQL Connected Successfully at:', res.rows[0].now);
    })
    .catch((err) => {
        console.error('Database Connection Error:', err.message);
    });

export default {
    query: (text, params) => pool.query(text, params),
    pool
};