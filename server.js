const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
const { sql } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security and utility middleware
app.use(helmet({
  contentSecurityPolicy: false, // Too restrictive for simple HTML/JS frontend sometimes, can be refined
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://team-current.vercel.app' : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Files - Registered BEFORE API routes so frontend loads without CSRF/auth issues initially
app.use(express.static(path.join(__dirname, 'public')));

// CSRF Protection configuration (using cookie for token)
const csrfProtection = csurf({ cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' } });

// Main API Router - We'll attach routes here
const apiRouter = express.Router();

let workerSchemaReady;
app.use('/api/workers', async (req, res, next) => {
  try {
    if (!workerSchemaReady) {
      workerSchemaReady = sql`
        ALTER TABLE workers
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false
      `.catch((error) => {
        workerSchemaReady = null;
        throw error;
      });
    }
    await workerSchemaReady;
    next();
  } catch (error) {
    console.error('Worker schema migration error:', error);
    res.status(500).json({ error: 'Worker service is temporarily unavailable' });
  }
});

// Routes mapping
apiRouter.use('/auth', require('./routes/auth'));
apiRouter.use('/workers', require('./routes/workers'));
apiRouter.use('/users', require('./routes/users'));
apiRouter.use('/items', require('./routes/items'));
apiRouter.use('/categories', require('./routes/categories'));
apiRouter.use('/purchases', require('./routes/purchases'));
apiRouter.use('/events', require('./routes/events'));
apiRouter.use('/lends', require('./routes/lends'));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/pages/login.html');
});


// Attach API router under /api
app.use('/api', apiRouter);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
