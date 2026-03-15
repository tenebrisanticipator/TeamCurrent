const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql } = require('../config/db');
const { loginRateLimiter } = require('../middleware/rateLimit');
const authenticateToken = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = await sql`SELECT * FROM users WHERE email = ${email} AND is_active = true`;
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ message: 'Login successful', user: { user_id: user.user_id, name: user.name, role: user.role, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ message: 'Logout successful' });
});

// GET /api/auth/verify (Used by frontend auth-guard)
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
