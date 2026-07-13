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
    console.error('Search workers error:', error);
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
    const { name, phone, address, aadhaar, blood_group, worker_type, joined_date, monthly_wage } = req.body;
    if (!name || !worker_type) {
      return res.status(400).json({ error: 'Name and Worker Type are required.' });
    }

    const db_phone = phone === undefined ? null : phone;
    const db_address = address === undefined ? null : address;
    const db_blood_group = (blood_group === undefined || !blood_group) ? null : blood_group;
    const db_joined_date = (joined_date === undefined || !joined_date) ? null : joined_date;
    const db_monthly_wage = (monthly_wage === undefined || !monthly_wage) ? 0 : monthly_wage;

    let aadhaarEncrypted = null;
    if (aadhaar && aadhaar !== '••••••••••••') {
      aadhaarEncrypted = encrypt(aadhaar);
    }

    const workerCode = await generateWorkerId();

    const [worker] = await sql`
      INSERT INTO workers (worker_code, name, phone, address, aadhaar_encrypted, blood_group, worker_type, joined_date, monthly_wage)
      VALUES (${workerCode}, ${name}, ${db_phone}, ${db_address}, ${aadhaarEncrypted}, ${db_blood_group}, ${worker_type}, ${db_joined_date}, ${db_monthly_wage})
      RETURNING worker_id, worker_code, name, worker_type
    `;
    
    res.status(201).json(worker);
  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ATTENDANCE ROUTES (BEFORE :id routes) ==========

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
    console.error('Attendance update error:', error);
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

// ========== SINGLE WORKER ROUTES (AFTER specific sub-routes) ==========

// GET /api/workers/:id
router.get('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const workers = await sql`SELECT * FROM workers WHERE worker_id = ${req.params.id}`;
    if (workers.length === 0) return res.status(404).json({ error: 'Worker not found' });
    
    const worker = workers[0];
    
    // Only admins see decrypted Aadhaar
    if (worker.aadhaar_encrypted) {
      try {
        worker.aadhaar = decrypt(worker.aadhaar_encrypted);
      } catch (decryptErr) {
        console.error('Decryption error for worker', req.params.id, ':', decryptErr.message);
        worker.aadhaar = '••••••••••••'; // Fallback to masked value if decryption fails
      }
    }
    delete worker.aadhaar_encrypted; // Never send ciphertext to frontend
    
    res.json(worker);
  } catch (error) {
    console.error('Get worker error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/workers/:id
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, phone, address, aadhaar, blood_group, worker_type, is_active, joined_date, monthly_wage } = req.body;
    
    // Map undefined values defensively to prevent postgres UNDEFINED_VALUE errors
    const db_name = name === undefined ? null : name;
    const db_phone = phone === undefined ? null : phone;
    const db_address = address === undefined ? null : address;
    const db_blood_group = (blood_group === undefined || !blood_group) ? null : blood_group;
    const db_worker_type = worker_type === undefined ? null : worker_type;
    const db_is_active = is_active === undefined ? true : is_active;
    const db_joined_date = (joined_date === undefined || !joined_date) ? null : joined_date;
    const db_monthly_wage = (monthly_wage === undefined || !monthly_wage) ? 0 : monthly_wage;

    let query;
    if (aadhaar && aadhaar !== '••••••••••••') {
      try {
        const aadhaarEncrypted = encrypt(aadhaar);
        query = sql`
          UPDATE workers SET 
            name = ${db_name}, phone = ${db_phone}, address = ${db_address}, aadhaar_encrypted = ${aadhaarEncrypted}, 
            blood_group = ${db_blood_group}, worker_type = ${db_worker_type}, is_active = ${db_is_active}, 
            joined_date = ${db_joined_date}, monthly_wage = ${db_monthly_wage}
          WHERE worker_id = ${req.params.id} RETURNING worker_id
        `;
      } catch (encryptErr) {
        console.error('Encryption error:', encryptErr.message);
        return res.status(500).json({ error: 'Encryption failed: ' + encryptErr.message });
      }
    } else {
      query = sql`
        UPDATE workers SET 
          name = ${db_name}, phone = ${db_phone}, address = ${db_address}, 
          blood_group = ${db_blood_group}, worker_type = ${db_worker_type}, is_active = ${db_is_active}, 
          joined_date = ${db_joined_date}, monthly_wage = ${db_monthly_wage}
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

// GET /api/workers/:id/attendance-history
router.get('/:id/attendance-history', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const logs = await sql`
      SELECT id, date, status, location_note, created_at
      FROM attendance
      WHERE worker_id = ${req.params.id}
      ORDER BY date ASC
    `;

    const history = [];
    let currentActive = null;

    for (const log of logs) {
      const formattedDate = new Date(log.date).toISOString().slice(0, 10);
      if (log.status === 'present') {
        if (currentActive) {
          history.push({
            active_date: new Date(currentActive.date).toISOString().slice(0, 10),
            inactive_date: null,
            note: null,
            status: 'Active'
          });
        }
        currentActive = log;
      } else if (log.status === 'absent') {
        if (currentActive) {
          history.push({
            active_date: new Date(currentActive.date).toISOString().slice(0, 10),
            inactive_date: formattedDate,
            note: log.location_note || '',
            status: 'Inactive'
          });
          currentActive = null;
        } else {
          history.push({
            active_date: null,
            inactive_date: formattedDate,
            note: log.location_note || '',
            status: 'Inactive'
          });
        }
      }
    }

    if (currentActive) {
      history.push({
        active_date: new Date(currentActive.date).toISOString().slice(0, 10),
        inactive_date: null,
        note: null,
        status: 'Active'
      });
    }

    history.reverse();
    res.json(history);
  } catch (error) {
    console.error('Fetch attendance history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workers/:id/salary-summary
router.get('/:id/salary-summary', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const [worker] = await sql`SELECT monthly_wage FROM workers WHERE worker_id = ${req.params.id}`;
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const monthly_wage = parseFloat(worker.monthly_wage || 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);

    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
    const endOfMonthStr = endOfMonth.toISOString().slice(0, 10);

    const [sumRes] = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total_given
      FROM salary_payments
      WHERE worker_id = ${req.params.id}
        AND given_date >= ${startOfMonthStr}
        AND given_date <= ${endOfMonthStr}
    `;

    const total_given = parseFloat(sumRes.total_given || 0);
    const remaining = monthly_wage - total_given;

    res.json({
      monthly_wage,
      total_given_this_month: total_given,
      remaining_balance: remaining
    });
  } catch (error) {
    console.error('Fetch salary summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workers/:id/payments
router.get('/:id/payments', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const payments = await sql`
      SELECT sp.*, u.name AS given_by_name
      FROM salary_payments sp
      LEFT JOIN users u ON sp.given_by = u.user_id
      WHERE sp.worker_id = ${req.params.id}
      ORDER BY sp.given_date DESC, sp.given_time DESC
    `;
    res.json(payments);
  } catch (error) {
    console.error('Fetch payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workers/:id/payments
router.post('/:id/payments', authorizeRole(['admin', 'manager']), async (req, res) => {
  try {
    const { amount, notes } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Amount is required and must be a number' });

    const now = new Date();
    const given_date = now.toISOString().slice(0, 10);
    const given_time = now.toTimeString().slice(0, 8);

    const [payment] = await sql`
      INSERT INTO salary_payments (worker_id, amount, given_by, given_date, given_time, notes)
      VALUES (${req.params.id}, ${amount}, ${req.user.user_id}, ${given_date}, ${given_time}, ${notes || null})
      RETURNING *
    `;
    res.status(201).json(payment);
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/workers/:id
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
  try {
    await sql`DELETE FROM workers WHERE worker_id = ${req.params.id}`;
    res.json({ message: 'Worker deleted' });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(400).json({ error: 'Cannot delete worker. Unlink from events or user first.' });
  }
});

module.exports = router;
