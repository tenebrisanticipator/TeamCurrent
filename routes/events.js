const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const { generateEventChallanPDF, generateEventChallanWithLogsPDF } = require('../utils/pdfGenerator');

router.use(authenticateToken);

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    
    let query;
    if (req.query.cursor) {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii'));
      query = sql`
        SELECT * FROM events
        WHERE (created_at, event_id) < (${cursor.created_at}, ${cursor.id})
        AND (event_name ILIKE ${'%' + search + '%'} OR client_company ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, event_id DESC LIMIT ${limit + 1}
      `;
    } else {
      query = sql`
        SELECT * FROM events
        WHERE (event_name ILIKE ${'%' + search + '%'} OR client_company ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, event_id DESC LIMIT ${limit + 1}
      `;
    }
    
    const eventsList = await query;
    const hasNext = eventsList.length > limit;
    const data = hasNext ? eventsList.slice(0, limit) : eventsList;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.event_id })).toString('base64');
    }

    const countRes = await sql`SELECT COUNT(*) as count FROM events WHERE (event_name ILIKE ${'%' + search + '%'} OR client_company ILIKE ${'%' + search + '%'})`;
    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount: parseInt(countRes[0].count) || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const events = await sql`SELECT * FROM events WHERE event_id = ${req.params.id}`;
    if (events.length === 0) return res.status(404).json({ error: 'Event not found' });
    
    const event = events[0];

    // Fetch assigned workers
    const assignedWorkers = await sql`
      SELECT ew.id, w.worker_id, w.name, w.worker_code, w.worker_type, ew.role_note, ew.assigned_at
      FROM event_workers ew JOIN workers w ON ew.worker_id = w.worker_id
      WHERE ew.event_id = ${req.params.id}
    `;

    // Fetch assigned items
    const assignedItems = await sql`
      SELECT ei.id, i.item_id, i.name as item_name, i.unit, ei.quantity_assigned, 
             ei.quantity_returned, ei.quantity_missing, ei.assigned_at, ei.returned_at
      FROM event_items ei JOIN items i ON ei.item_id = i.item_id
      WHERE ei.event_id = ${req.params.id}
    `;

    res.json({ event, workers: assignedWorkers, items: assignedItems });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/events
router.post('/', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { event_name, client_company, client_contact, place, event_date, event_time } = req.body;
    const [event] = await sql`
      INSERT INTO events (event_name, client_company, client_contact, place, event_date, event_time, status, created_by)
      VALUES (${event_name}, ${client_company}, ${client_contact}, ${place}, ${event_date}, ${event_time}, 'upcoming', ${req.user.user_id})
      RETURNING *
    `;
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/events/:id
router.put('/:id', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { event_name, client_company, client_contact, place, event_date, event_time } = req.body;
    const [event] = await sql`
      UPDATE events SET 
        event_name = ${event_name}, client_company = ${client_company}, client_contact = ${client_contact},
        place = ${place}, event_date = ${event_date}, event_time = ${event_time}, updated_at = NOW()
      WHERE event_id = ${req.params.id} AND status != 'closed'
      RETURNING *
    `;
    if (!event) return res.status(400).json({ error: 'Event not found or closed' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/events/:id/status
router.patch('/:id/status', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['upcoming', 'ongoing', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid config' });

    const [event] = await sql`UPDATE events SET status = ${status}, updated_at = NOW() WHERE event_id = ${req.params.id} RETURNING *`;
    if (!event) return res.status(404).json({ error: 'Not found' });

    if (status === 'closed') {
      // Auto-return assigned workers to Godown for the current day
      await sql`
        UPDATE attendance SET location_note = 'Godown', event_id = NULL
        WHERE event_id = ${req.params.id} AND date = CURRENT_DATE
      `;
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Internal max events closed' });
  }
});

// POST /api/events/:id/assign-stock
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
    
    // Insert event_items record
    const [eventItem] = await sql`
      INSERT INTO event_items (event_id, item_id, quantity_assigned, assigned_by)
      VALUES (${req.params.id}, ${item_id}, ${quantity}, ${req.user.user_id})
      RETURNING *
    `;
    
    res.status(201).json(eventItem);
  } catch (error) {
    console.error('Assign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/events/:id/return-stock
router.post('/:id/return-stock', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { event_item_id, quantity_returned } = req.body;
    
    const [existing] = await sql`SELECT item_id, quantity_assigned, quantity_returned FROM event_items WHERE id = ${event_item_id}`;
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });
    
    const newReturned = existing.quantity_returned + parseInt(quantity_returned);
    if (newReturned > existing.quantity_assigned) {
      return res.status(400).json({ error: 'Returning more than assigned is not allowed' });
    }

    // Update event_items
    await sql`
      UPDATE event_items SET quantity_returned = ${newReturned}, returned_at = NOW(), returned_by = ${req.user.user_id}
      WHERE id = ${event_item_id}
    `;

    // Add back to available stock
    await sql`UPDATE items SET available_quantity = available_quantity + ${quantity_returned} WHERE item_id = ${existing.item_id}`;

    res.json({ message: 'Stock returned successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/events/:id/assign-worker (Admin only specs mention admin can assign worker, but manager might too. Restricted to admin by specs)
router.post('/:id/assign-worker', authorizeRole(['admin']), async (req, res) => {
  try {
    const { worker_id, role_note } = req.body;
    
    await sql`
      INSERT INTO event_workers (event_id, worker_id, role_note, assigned_by)
      VALUES (${req.params.id}, ${worker_id}, ${role_note || null}, ${req.user.user_id})
    `;

    // Also mark attendance as present with event location implicitly for today
    await sql`
      INSERT INTO attendance (worker_id, date, status, location_note, event_id, marked_by)
      VALUES (${worker_id}, CURRENT_DATE, 'present', 'Event Duty', ${req.params.id}, ${req.user.user_id})
      ON CONFLICT (worker_id, date) DO UPDATE 
      SET location_note = 'Event Duty', event_id = ${req.params.id}, marked_by = ${req.user.user_id}
    `;

    res.json({ message: 'Worker assigned' });
  } catch (error) {
    if(error.code === '23505') return res.status(400).json({error: 'Worker already assigned.'});
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/:id/challan/pdf
router.get('/:id/challan/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    await generateEventChallanPDF(req.params.id, res);
  } catch (error) {
    console.error('Error generating event challan PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

// GET /api/events/:id/challan/logs/pdf
router.get('/:id/challan/logs/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    await generateEventChallanWithLogsPDF(req.params.id, res);
  } catch (error) {
    console.error('Error generating event challan logs PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

module.exports = router;
