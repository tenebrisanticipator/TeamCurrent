const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');

router.use(authenticateToken);

// GET /api/lends
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    
    let query;
    if (req.query.cursor) {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii'));
      query = sql`
        SELECT * FROM lends
        WHERE (created_at, lend_id) < (${cursor.created_at}, ${cursor.id})
        AND (lend_name ILIKE ${'%' + search + '%'} OR borrower_company ILIKE ${'%' + search + '%'} OR borrower_name ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, lend_id DESC LIMIT ${limit + 1}
      `;
    } else {
      query = sql`
        SELECT * FROM lends
        WHERE (lend_name ILIKE ${'%' + search + '%'} OR borrower_company ILIKE ${'%' + search + '%'} OR borrower_name ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, lend_id DESC LIMIT ${limit + 1}
      `;
    }
    
    const lendsList = await query;
    const hasNext = lendsList.length > limit;
    const data = hasNext ? lendsList.slice(0, limit) : lendsList;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.lend_id })).toString('base64');
    }

    const countRes = await sql`
      SELECT COUNT(*) as count FROM lends 
      WHERE (lend_name ILIKE ${'%' + search + '%'} OR borrower_company ILIKE ${'%' + search + '%'} OR borrower_name ILIKE ${'%' + search + '%'})
    `;
    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount: parseInt(countRes[0].count) || 0 });
  } catch (error) {
    console.error('Error fetching lends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lends/:id
router.get('/:id', async (req, res) => {
  try {
    const lends = await sql`SELECT * FROM lends WHERE lend_id = ${req.params.id}`;
    if (lends.length === 0) return res.status(404).json({ error: 'Lend not found' });
    
    const lend = lends[0];

    // Fetch assigned items
    const assignedItems = await sql`
      SELECT li.id, i.item_id, i.name as item_name, i.unit, li.quantity_lent, 
             li.quantity_returned, li.quantity_missing, li.lent_at, li.returned_at, li.return_note
      FROM lend_items li JOIN items i ON li.item_id = i.item_id
      WHERE li.lend_id = ${req.params.id}
    `;

    res.json({ lend, items: assignedItems });
  } catch (error) {
    console.error('Error fetching lend details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lends
router.post('/', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { lend_name, borrower_name, borrower_company, client_contact, place, lend_date, lend_time } = req.body;
    const [lend] = await sql`
      INSERT INTO lends (lend_name, borrower_name, borrower_company, client_contact, place, lend_date, lend_time, status, created_by)
      VALUES (${lend_name}, ${borrower_name}, ${borrower_company}, ${client_contact}, ${place}, ${lend_date}, ${lend_time || null}, 'active', ${req.user.user_id})
      RETURNING *
    `;
    res.status(201).json(lend);
  } catch (error) {
    console.error('Error creating lend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/lends/:id
router.put('/:id', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { lend_name, borrower_name, borrower_company, client_contact, place, lend_date, lend_time } = req.body;
    const [lend] = await sql`
      UPDATE lends SET 
        lend_name = ${lend_name}, borrower_name = ${borrower_name}, borrower_company = ${borrower_company},
        client_contact = ${client_contact}, place = ${place}, lend_date = ${lend_date}, lend_time = ${lend_time || null}, updated_at = NOW()
      WHERE lend_id = ${req.params.id} AND status != 'closed'
      RETURNING *
    `;
    if (!lend) return res.status(400).json({ error: 'Lend not found or closed' });
    res.json(lend);
  } catch (error) {
    console.error('Error updating lend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/lends/:id/status
router.patch('/:id/status', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'returned', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const [lend] = await sql`UPDATE lends SET status = ${status}, updated_at = NOW() WHERE lend_id = ${req.params.id} RETURNING *`;
    if (!lend) return res.status(404).json({ error: 'Lend not found' });

    res.json(lend);
  } catch (error) {
    console.error('Error patching lend status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lends/:id/assign-stock
router.post('/:id/assign-stock', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { item_id, quantity } = req.body;
    
    // Check available quantity
    const [item] = await sql`SELECT available_quantity FROM items WHERE item_id = ${item_id}`;
    if (!item || item.available_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock available.' });
    }

    // Deduct stock
    await sql`UPDATE items SET available_quantity = available_quantity - ${quantity} WHERE item_id = ${item_id}`;
    
    // Insert lend_items record
    const [lendItem] = await sql`
      INSERT INTO lend_items (lend_id, item_id, quantity_lent, lent_by, lent_at)
      VALUES (${req.params.id}, ${item_id}, ${quantity}, ${req.user.user_id}, NOW())
      RETURNING *
    `;
    
    res.status(201).json(lendItem);
  } catch (error) {
    console.error('Assign error for lend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lends/:id/return-stock
router.post('/:id/return-stock', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { lend_item_id, quantity_returned, return_note } = req.body;
    
    const [existing] = await sql`SELECT item_id, quantity_lent, quantity_returned FROM lend_items WHERE id = ${lend_item_id}`;
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });
    
    const newReturned = existing.quantity_returned + parseInt(quantity_returned);
    if (newReturned > existing.quantity_lent) {
      return res.status(400).json({ error: 'Returning more than assigned is not allowed' });
    }

    // Update lend_items
    await sql`
      UPDATE lend_items SET 
        quantity_returned = ${newReturned}, 
        returned_at = NOW(), 
        returned_by = ${req.user.user_id},
        return_note = CASE 
          WHEN ${return_note || ''} = '' THEN return_note 
          WHEN return_note IS NULL OR return_note = '' THEN ${return_note} 
          ELSE return_note || '; ' || ${return_note} 
        END
      WHERE id = ${lend_item_id}
    `;

    // Add back to available stock
    await sql`UPDATE items SET available_quantity = available_quantity + ${quantity_returned} WHERE item_id = ${existing.item_id}`;

    res.json({ message: 'Stock returned successfully' });
  } catch (error) {
    console.error('Return error for lend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lends/:id/challan/pdf
router.get('/:id/challan/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    const { generateLendChallanPDF } = require('../utils/pdfGenerator');
    await generateLendChallanPDF(req.params.id, res);
  } catch (error) {
    console.error('Lend PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// GET /api/lends/:id/challan/logs/pdf
router.get('/:id/challan/logs/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    const { generateLendChallanWithLogsPDF } = require('../utils/pdfGenerator');
    await generateLendChallanWithLogsPDF(req.params.id, res);
  } catch (error) {
    console.error('Lend Logs PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
