const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const { getCache, setCache } = require('../utils/cache');

router.use(authenticateToken);

// GET /api/items/search?q=&limit=10 (For dropdowns)
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    if (q.length < 2) return res.json({ data: [] });
    
    // Cache for 2 mins
    const cacheKey = `item_search_${q}_${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ data: cached });

    const items = await sql`
      SELECT item_id, name, available_quantity, unit 
      FROM items 
      WHERE name ILIKE ${'%' + q + '%'} AND is_deleted = false
      ORDER BY name ASC
      LIMIT ${limit}
    `;
    
    setCache(cacheKey, items, 120000); // 2 mins
    res.json({ data: items });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/items (Paginated admin/manager view)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const categoryId = req.query.category || null;
    
    let query;
    if (req.query.cursor) {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii'));
      if (categoryId) {
        query = sql`
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN categories c ON i.category_id = c.category_id
          WHERE (i.created_at, i.item_id) < (${cursor.created_at}, ${cursor.id})
          AND i.name ILIKE ${'%' + search + '%'} AND i.is_deleted = false AND i.category_id = ${categoryId}
          ORDER BY i.created_at DESC, i.item_id DESC LIMIT ${limit + 1}
        `;
      } else {
        query = sql`
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN categories c ON i.category_id = c.category_id
          WHERE (i.created_at, i.item_id) < (${cursor.created_at}, ${cursor.id})
          AND i.name ILIKE ${'%' + search + '%'} AND i.is_deleted = false
          ORDER BY i.created_at DESC, i.item_id DESC LIMIT ${limit + 1}
        `;
      }
    } else {
      if (categoryId) {
        query = sql`
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN categories c ON i.category_id = c.category_id
          WHERE i.name ILIKE ${'%' + search + '%'} AND i.is_deleted = false AND i.category_id = ${categoryId}
          ORDER BY i.created_at DESC, i.item_id DESC LIMIT ${limit + 1}
        `;
      } else {
        query = sql`
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN categories c ON i.category_id = c.category_id
          WHERE i.name ILIKE ${'%' + search + '%'} AND i.is_deleted = false
          ORDER BY i.created_at DESC, i.item_id DESC LIMIT ${limit + 1}
        `;
      }
    }
    
    const itemsList = await query;
    const hasNext = itemsList.length > limit;
    const data = hasNext ? itemsList.slice(0, limit) : itemsList;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.item_id })).toString('base64');
    }

    // Approx total count
    let countQuery;
    if (categoryId) {
       countQuery = await sql`SELECT COUNT(*) FROM items WHERE name ILIKE ${'%' + search + '%'} AND is_deleted = false AND category_id = ${categoryId}`;
    } else if (search) {
       countQuery = await sql`SELECT COUNT(*) FROM items WHERE name ILIKE ${'%' + search + '%'} AND is_deleted = false`;
    } else {
       countQuery = await sql`SELECT COUNT(*) as count FROM items WHERE is_deleted = false`;
    }
    let totalCount = parseInt(countQuery[0].count);
    if (isNaN(totalCount) || totalCount < 0) totalCount = 0;

    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/items/:id
router.get('/:id', async (req, res) => {
  try {
    const items = await sql`
      SELECT i.*, c.name as category_name 
      FROM items i LEFT JOIN categories c ON i.category_id = c.category_id 
      WHERE i.item_id = ${req.params.id} AND i.is_deleted = false
    `;
    if (items.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(items[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/items (Admin only)
router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, category_id, total_quantity, available_quantity, unit, description } = req.body;
    if (!name || !category_id) return res.status(400).json({ error: 'Name and category are required' });

    const [item] = await sql`
      INSERT INTO items (name, category_id, total_quantity, available_quantity, unit, description)
      VALUES (${name}, ${category_id}, ${total_quantity || 0}, ${available_quantity || 0}, ${unit || 'pcs'}, ${description})
      RETURNING *
    `;
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/items/:id (Admin only)
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, category_id, total_quantity, available_quantity, unit, description } = req.body;
    
    const [item] = await sql`
      UPDATE items SET 
        name = ${name}, category_id = ${category_id}, total_quantity = ${total_quantity},
        available_quantity = ${available_quantity}, unit = ${unit}, description = ${description},
        updated_at = NOW()
      WHERE item_id = ${req.params.id} AND is_deleted = false
      RETURNING *
    `;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/items/:id/adjust-quantity (Manager & Admin)
router.patch('/:id/adjust-quantity', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { amount_change } = req.body; // e.g. +5 or -3
    if (typeof amount_change !== 'number') return res.status(400).json({ error: 'Invalid amount' });

    const [item] = await sql`
      UPDATE items SET 
        available_quantity = available_quantity + ${amount_change},
        updated_at = NOW()
      WHERE item_id = ${req.params.id} AND is_deleted = false
      RETURNING *
    `;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id (Soft delete, Admin only)
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    await sql`UPDATE items SET is_deleted = true, updated_at = NOW() WHERE item_id = ${req.params.id}`;
    res.json({ message: 'Item deleted safely' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
