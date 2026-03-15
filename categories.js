const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const { getCache, setCache, deleteCache } = require('../utils/cache');

router.use(authenticateToken);

// GET /api/categories
router.get('/', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const cacheKey = 'categories_list';
    const cached = getCache(cacheKey);
    if (cached) return res.json({ data: cached });

    const categories = await sql`SELECT category_id, name, description FROM categories ORDER BY name ASC`;
    setCache(cacheKey, categories, 300000); // 5 mins
    
    res.json({ data: categories });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/categories
router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const [category] = await sql`
      INSERT INTO categories (name, description) VALUES (${name}, ${description || null})
      RETURNING category_id, name, description
    `;
    
    deleteCache('categories_list');
    res.status(201).json(category);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/categories/:id
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const [category] = await sql`
      UPDATE categories SET name = ${name}, description = ${description || null}
      WHERE category_id = ${req.params.id}
      RETURNING category_id, name, description
    `;
    if (!category) return res.status(404).json({ error: 'Category not found' });
    
    deleteCache('categories_list');
    res.json(category);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    // Check if items use this category
    const itemsUsing = await sql`SELECT item_id FROM items WHERE category_id = ${req.params.id} LIMIT 1`;
    if (itemsUsing.length > 0) {
      return res.status(400).json({ error: 'Cannot delete category in use by items' });
    }
    
    await sql`DELETE FROM categories WHERE category_id = ${req.params.id}`;
    deleteCache('categories_list');
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
