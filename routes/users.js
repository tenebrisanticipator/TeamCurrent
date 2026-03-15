const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const bcrypt = require('bcrypt');

router.use(authenticateToken);

// GET /api/users - List users (Admin only)
router.get('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    
    // Simple offset pagination for users as table is typically small, 
    // but applying cursor based for consistency if preferred. 
    // We'll use offset here for simplicity since user count < 100 normally, 
    // but the task requested cursor pagination everywhere. Let's do cursor.
    const cursorTime = req.query.cursor ? JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii')).created_at : null;
    const cursorId = req.query.cursor ? JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii')).id : null;
    
    let query;
    if (cursorTime && cursorId) {
      if (search) {
        query = sql`
          SELECT user_id, name, email, role, worker_id, is_active, created_at
          FROM users 
          WHERE (created_at, user_id) < (${cursorTime}, ${cursorId})
          AND (name ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'})
          ORDER BY created_at DESC, user_id DESC 
          LIMIT ${limit + 1}
        `;
      } else {
        query = sql`
          SELECT user_id, name, email, role, worker_id, is_active, created_at
          FROM users 
          WHERE (created_at, user_id) < (${cursorTime}, ${cursorId})
          ORDER BY created_at DESC, user_id DESC 
          LIMIT ${limit + 1}
        `;
      }
    } else {
      if (search) {
        query = sql`
          SELECT user_id, name, email, role, worker_id, is_active, created_at
          FROM users 
          WHERE (name ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'})
          ORDER BY created_at DESC, user_id DESC 
          LIMIT ${limit + 1}
        `;
      } else {
        query = sql`
          SELECT user_id, name, email, role, worker_id, is_active, created_at
          FROM users 
          ORDER BY created_at DESC, user_id DESC 
          LIMIT ${limit + 1}
        `;
      }
    }
    
    const users = await query;
    const hasNext = users.length > limit;
    const data = hasNext ? users.slice(0, limit) : users;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.user_id })).toString('base64');
    }

    // Estimate total count
    const countRes = await sql`SELECT COUNT(*) as exact_count FROM users WHERE name ILIKE ${'%' + search + '%'}`;
    
    res.json({
      data,
      nextCursor,
      hasNext,
      pageSize: limit,
      totalCount: parseInt(countRes[0].exact_count)
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users - Create user (Admin only)
router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, email, password, role, worker_id } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Explicitly handle null for worker_id
    const workerIdParam = worker_id || null;

    const [newUser] = await sql`
      INSERT INTO users (name, email, password_hash, role, worker_id)
      VALUES (${name}, ${email}, ${passwordHash}, ${role}, ${workerIdParam})
      RETURNING user_id, name, email, role, worker_id
    `;
    
    res.status(201).json(newUser);
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Email already exists.' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id - Get single user (Admin or Self)
router.get('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.user_id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    
    const users = await sql`SELECT user_id, name, email, role, worker_id, is_active, permissions FROM users WHERE user_id = ${req.params.id}`;
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id - Update user (Admin)
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, email, role, worker_id } = req.body;
    const workerIdParam = worker_id || null;
    
    const users = await sql`
      UPDATE users SET name = ${name}, email = ${email}, role = ${role}, worker_id = ${workerIdParam}
      WHERE user_id = ${req.params.id}
      RETURNING user_id, name, email, role, worker_id
    `;
    
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/password - Change password (Admin or Self)
router.patch('/:id/password', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.user_id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const { password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE user_id = ${req.params.id}`;
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/status - Toggle active/inactive (Admin)
router.patch('/:id/status', authorizeRole(['admin']), async (req, res) => {
  try {
    const { is_active } = req.body;
    await sql`UPDATE users SET is_active = ${is_active} WHERE user_id = ${req.params.id}`;
    res.json({ message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/permissions - Update permissions (Admin)
router.patch('/:id/permissions', authorizeRole(['admin']), async (req, res) => {
  try {
    const { permissions } = req.body; // should be JSON array
    await sql`UPDATE users SET permissions = ${JSON.stringify(permissions)} WHERE user_id = ${req.params.id}`;
    res.json({ message: 'Permissions updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id - Delete user (Hard delete, Admin)
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    await sql`DELETE FROM users WHERE user_id = ${req.params.id}`;
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Cannot delete user due to existing relationships.' });
  }
});

module.exports = router;
