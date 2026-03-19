const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
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
app.use(express.static('public'));

// CSRF Protection configuration (using cookie for token)
const csrfProtection = csurf({ cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' } });

// Main API Router - We'll attach routes here
const apiRouter = express.Router();

// Routes mapping
apiRouter.use('/auth', require('./routes/auth'));
apiRouter.use('/workers', require('./routes/workers'));
apiRouter.use('/users', require('./routes/users'));
apiRouter.use('/items', require('./routes/items'));
apiRouter.use('/categories', require('./routes/categories'));
apiRouter.use('/purchases', require('./routes/purchases'));
apiRouter.use('/events', require('./routes/events'));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/pages/login.html');
});


// Attach API router under /api
app.use('/api', apiRouter);

// Daily cron job for attendance
// Cron at 18:30 UTC (midnight IST) daily
cron.schedule('30 18 * * *', async () => {
  try {
    console.log('Running daily attendance auto-populate...');
    await sql`
      INSERT INTO attendance (worker_id, date, status, location_note)
      SELECT worker_id, CURRENT_DATE, 'present', 'Godown'
      FROM workers WHERE is_active = true
      ON CONFLICT (worker_id, date) DO NOTHING;
    `;
    console.log('Daily attendance generated.');
  } catch (error) {
    console.error('Attendance cron error:', error);
  }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
