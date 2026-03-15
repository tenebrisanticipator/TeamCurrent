const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const authenticateToken = require('../middleware/auth');
const authorizeRole = require('../middleware/roles');
const { encrypt, decrypt } = require('../utils/encryption');
const { generateWorkerId } = require('../utils/workerIdGen');

router.use(authenticateToken);

// GET /api/workers/search (Dropdown lazy load)
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    if (q.length < 2) return res.json({ data: [] });
    
    const workers = await sql`
      SELECT worker_id, worker_code, name, worker_type 
      FROM workers 
      WHERE (name ILIKE ${'%' + q + '%'} OR worker_code ILIKE ${'%' + q + '%'}) 
      AND is_active = true
      LIMIT ${limit}
    `;
    res.json({ data: workers });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workers - List workers (Paginated)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    
    let query;
    if (req.query.cursor) {
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('ascii'));
      query = sql`
        SELECT worker_id, worker_code, name, phone, worker_type, is_active, joined_date, created_at
        FROM workers
        WHERE (created_at, worker_id) < (${cursor.created_at}, ${cursor.id})
        AND (name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, worker_id DESC
        LIMIT ${limit + 1}
      `;
    } else {
      query = sql`
        SELECT worker_id, worker_code, name, phone, worker_type, is_active, joined_date, created_at
        FROM workers
        WHERE (name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, worker_id DESC
        LIMIT ${limit + 1}
      `;
    }
    
    const workers = await query;
    const hasNext = workers.length > limit;
    const data = hasNext ? workers.slice(0, limit) : workers;
    
    let nextCursor = null;
    if (hasNext) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.worker_id })).toString('base64');
    }

    const countRes = await sql`SELECT COUNT(*) as count FROM workers WHERE name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'}`;
    let totalCount = parseInt(countRes[0].count);
    if (search) {
       const exactCount = await sql`SELECT COUNT(*) FROM workers WHERE name ILIKE ${'%' + search + '%'}`;
       totalCount = parseInt(exactCount[0].count);
    }
    
    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount });
  } catch (error) {
    console.error('List workers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workers - Create worker (Admin)
router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, phone, address, aadhaar, blood_group, worker_type, joined_date } = req.body;
    if (!name || !worker_type) {
      return res.status(400).json({ error: 'Name and Worker Type are required.' });
    }

    let aadhaarEncrypted = null;
    if (aadhaar) {
      aadhaarEncrypted = encrypt(aadhaar);
    }

    const workerCode = await generateWorkerId();

    const [worker] = await sql`
      INSERT INTO workers (worker_code, name, phone, address, aadhaar_encrypted, blood_group, worker_type, joined_date)
      VALUES (${workerCode}, ${name}, ${phone}, ${address}, ${aadhaarEncrypted}, ${blood_group}, ${worker_type}, ${joined_date || null})
      RETURNING worker_id, worker_code, name, worker_type
    `;
    
    res.status(201).json(worker);
  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workers/:id
router.get('/:id', async (req, res) => {
  try {
    const workers = await sql`SELECT * FROM workers WHERE worker_id = ${req.params.id}`;
    if (workers.length === 0) return res.status(404).json({ error: 'Worker not found' });
    
    const worker = workers[0];
    
    // Only admins see decrypted Aadhaar
    if (req.user.role === 'admin' && worker.aadhaar_encrypted) {
      worker.aadhaar = decrypt(worker.aadhaar_encrypted);
    }
    delete worker.aadhaar_encrypted; // Never send ciphertext to frontend
    
    res.json(worker);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/workers/:id
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, phone, address, aadhaar, blood_group, worker_type, is_active, joined_date } = req.body;
    
    let query;
    if (aadhaar && aadhaar !== '••••••••••••') {
      const aadhaarEncrypted = encrypt(aadhaar);
      query = sql`
        UPDATE workers SET 
          name = ${name}, phone = ${phone}, address = ${address}, aadhaar_encrypted = ${aadhaarEncrypted}, 
          blood_group = ${blood_group}, worker_type = ${worker_type}, is_active = ${is_active}, joined_date = ${joined_date}
        WHERE worker_id = ${req.params.id} RETURNING worker_id
      `;
    } else {
      query = sql`
        UPDATE workers SET 
          name = ${name}, phone = ${phone}, address = ${address}, 
          blood_group = ${blood_group}, worker_type = ${worker_type}, is_active = ${is_active}, joined_date = ${joined_date}
        WHERE worker_id = ${req.params.id} RETURNING worker_id
      `;
    }
    
    const updated = await query;
    if (updated.length === 0) return res.status(404).json({ error: 'Worker not found' });
    
    res.json({ message: 'Worker updated successfully' });
  } catch (error) {
    console.error('Update worker error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/workers/:id
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    await sql`DELETE FROM workers WHERE worker_id = ${req.params.id}`;
    res.json({ message: 'Worker deleted' });
  } catch (error) {
    res.status(400).json({ error: 'Cannot delete worker. Unlink from events or user first.' });
  }
});

// ATTENDANCE

// GET /api/workers/:id/attendance
router.get('/:id/attendance', async (req, res) => {
  try {
    const limit = 31; // One month max
    const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const attendance = await sql`
      SELECT id, date, status, location_note, event_id
      FROM attendance
      WHERE worker_id = ${req.params.id} AND date >= ${startDate} AND date <= ${endDate}
      ORDER BY date DESC
      LIMIT ${limit}
    `;
    
    res.json({ data: attendance });
  } catch (error) {
    console.error('Attendance fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workers/:id/attendance - Manual override (Admin/Manager)
router.post('/:id/attendance', async (req, res) => {
  try {
    const { date, status, location_note } = req.body;
    if (!date || !status) return res.status(400).json({ error: 'Date and status required' });

    await sql`
      INSERT INTO attendance (worker_id, date, status, location_note, marked_by)
      VALUES (${req.params.id}, ${date}, ${status}, ${location_note || 'Godown'}, ${req.user.user_id})
      ON CONFLICT (worker_id, date) DO UPDATE 
      SET status = EXCLUDED.status, location_note = EXCLUDED.location_note, marked_by = EXCLUDED.marked_by
    `;
    
    res.json({ message: 'Attendance updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workers/:id/attendance/pdf - Generates PDF (stub handled later or here)
router.get('/:id/attendance/pdf', authorizeRole(['admin']), async (req, res) => {
  try {
    // Generate PDF logic will go here
    const { generateWorkerAttendancePDF } = require('../utils/pdfGenerator');
    await generateWorkerAttendancePDF(req.params.id, req.query.month, res);
  } catch (error) {
    console.error('PDF error', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
