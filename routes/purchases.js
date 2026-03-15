const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const { generatePurchasePDF } = require('../utils/pdfGenerator');

router.use(authenticateToken);

// GET /api/purchases (Paginated list)
router.get('/', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    let query;
    if (req.query.cursor) {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii'));
      query = sql`
        SELECT p.*, i.name as item_name, s.company_name as supplier_name, u.name as added_by_name
        FROM purchases p
        JOIN items i ON p.item_id = i.item_id
        JOIN suppliers s ON p.supplier_id = s.supplier_id
        LEFT JOIN users u ON p.added_by = u.user_id
        WHERE (p.created_at, p.purchase_id) < (${cursor.created_at}, ${cursor.id})
        ORDER BY p.created_at DESC, p.purchase_id DESC
        LIMIT ${limit + 1}
      `;
    } else {
      query = sql`
        SELECT p.*, i.name as item_name, s.company_name as supplier_name, u.name as added_by_name
        FROM purchases p
        JOIN items i ON p.item_id = i.item_id
        JOIN suppliers s ON p.supplier_id = s.supplier_id
        LEFT JOIN users u ON p.added_by = u.user_id
        ORDER BY p.created_at DESC, p.purchase_id DESC
        LIMIT ${limit + 1}
      `;
    }
    
    const purchasesList = await query;
    const hasNext = purchasesList.length > limit;
    const data = hasNext ? purchasesList.slice(0, limit) : purchasesList;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.purchase_id })).toString('base64');
    }

    const countQuery = await sql`SELECT COUNT(*) as count FROM purchases`;
    const totalCount = parseInt(countQuery[0].count) || 0;

    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount });
  } catch (error) {
    console.error('List purchases error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/purchases/:id
router.get('/:id', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const purchases = await sql`
      SELECT p.*, i.name as item_name, s.company_name as supplier_name, u.name as added_by_name
      FROM purchases p
      JOIN items i ON p.item_id = i.item_id
      JOIN suppliers s ON p.supplier_id = s.supplier_id
      LEFT JOIN users u ON p.added_by = u.user_id
      WHERE p.purchase_id = ${req.params.id}
    `;
    if (purchases.length === 0) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchases[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/purchases (Admin & Manager)
router.post('/', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { item_id, supplier_id, quantity, purchase_date, notes } = req.body;
    if (!item_id || !supplier_id || !quantity || !purchase_date) {
      return res.status(400).json({ error: 'Missing required purchase fields' });
    }

    // Insert purchase and update item quantity inside a transaction conceptually
    // Neon HTTP pg driver doesn't strictly support `BEGIN` without specialized tx blocks for connectionless,
    // so we execute sequentially (good enough for simple app, or using neon's multi-statement if supported).
    
    // Using simple sequential await
    const [purchase] = await sql`
      INSERT INTO purchases (item_id, supplier_id, quantity, purchase_date, notes, added_by)
      VALUES (${item_id}, ${supplier_id}, ${quantity}, ${purchase_date}, ${notes || null}, ${req.user.user_id})
      RETURNING *
    `;

    // Increment item quantities
    await sql`
      UPDATE items SET 
        total_quantity = total_quantity + ${quantity},
        available_quantity = available_quantity + ${quantity},
        updated_at = NOW()
      WHERE item_id = ${item_id}
    `;

    res.status(201).json(purchase);
  } catch (error) {
    console.error('Create purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/purchases/:id/pdf (Admin only)
router.get('/:id/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    // Generate PDF logic will go here
    await generatePurchasePDF(req.params.id, res);
  } catch (error) {
    console.error('PDF error', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// For suppliers dropdown, quickly add this route as well here
router.get('/suppliers/search', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const q = req.query.q || '';
    const suppliers = await sql`
      SELECT supplier_id, company_name FROM suppliers 
      WHERE company_name ILIKE ${'%' + q + '%'} LIMIT 10
    `;
    res.json({ data: suppliers });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching suppliers' });
  }
});

// POST /api/purchases/suppliers (Quick add supplier)
router.post('/suppliers', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { company_name, contact_person, phone } = req.body;
    const [supplier] = await sql`
      INSERT INTO suppliers (company_name, contact_person, phone) 
      VALUES (${company_name}, ${contact_person}, ${phone}) RETURNING *
    `;
    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ error: 'Error adding supplier' });
  }
});

module.exports = router;
