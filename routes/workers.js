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
      AND is_deleted = false
      LIMIT ${limit}
    `;
    res.json({ data: workers });
  } catch (error) {
    console.error('Search workers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', authorizeRole(['admin']), async (req, res) => {
  try {
    const [result] = await sql`
      SELECT COUNT(DISTINCT a.worker_id) AS present_today
      FROM attendance a
      JOIN workers w ON w.worker_id = a.worker_id
      WHERE a.date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND LOWER(BTRIM(a.status)) IN ('present', 'checked in', 'half day', 'half-day')
        AND w.is_active = true
        AND w.is_deleted = false
    `;
    res.json({ presentToday: Number(result.present_today) });
  } catch (error) {
    console.error('Worker stats error:', error);
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
        WHERE is_deleted = false
        AND (created_at, worker_id) < (${cursor.created_at}, ${cursor.id})
        AND (name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'})
        ORDER BY created_at DESC, worker_id DESC
        LIMIT ${limit + 1}
      `;
    } else {
      query = sql`
        SELECT worker_id, worker_code, name, phone, worker_type, is_active, joined_date, created_at
        FROM workers
        WHERE is_deleted = false
        AND (name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'})
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

    const [countRes] = await sql`
      SELECT COUNT(*) AS count
      FROM workers
      WHERE is_deleted = false
        AND (name ILIKE ${'%' + search + '%'} OR worker_code ILIKE ${'%' + search + '%'})
    `;
    const totalCount = parseInt(countRes.count);
    
    res.json({ data, nextCursor, hasNext, pageSize: limit, totalCount });
  } catch (error) {
    console.error('List workers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workers - Create worker (Admin)
router.post('/', authorizeRole(['admin']), async (req, res) => {
  try {
    const { name, phone, address, aadhaar, blood_group, worker_type, joined_date, monthly_wage, is_active } = req.body;
    const safeName = typeof name === 'string' ? name.trim() : '';
    const safeJoinedDate = typeof joined_date === 'string' ? joined_date.trim() : joined_date;

    if (!safeName) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    if (!safeJoinedDate) {
      return res.status(400).json({ error: 'Joining date is required.' });
    }

    const db_name = safeName;
    const db_phone = phone && String(phone).trim() ? String(phone).trim() : null;
    const db_address = address && String(address).trim() ? String(address).trim() : null;
    const db_blood_group = blood_group && String(blood_group).trim() ? String(blood_group).trim() : null;
    const db_worker_type = worker_type && String(worker_type).trim() ? String(worker_type).trim() : null;
    const db_joined_date = safeJoinedDate;
    const db_monthly_wage = monthly_wage === undefined || monthly_wage === null || monthly_wage === '' || Number(monthly_wage) === 0 ? 0 : Number(monthly_wage);
    const db_is_active = typeof is_active === 'boolean' ? is_active : true;

    let aadhaarEncrypted = null;
    if (aadhaar && aadhaar !== '••••••••••••') {
      const cleanAadhaar = String(aadhaar).trim();
      if (cleanAadhaar) {
        try {
          aadhaarEncrypted = encrypt(cleanAadhaar);
        } catch (encryptErr) {
          console.error('Aadhaar encryption error:', encryptErr);
          return res.status(400).json({ error: 'Invalid Aadhaar format for encryption.' });
        }
      }
    }

    const workerCode = await generateWorkerId();

    const [worker] = await sql`
      INSERT INTO workers (worker_code, name, phone, address, aadhaar_encrypted, blood_group, worker_type, joined_date, monthly_wage, is_active)
      VALUES (${workerCode}, ${db_name}, ${db_phone}, ${db_address}, ${aadhaarEncrypted}, ${db_blood_group}, ${db_worker_type}, ${db_joined_date}, ${db_monthly_wage}, ${db_is_active})
      RETURNING worker_id, worker_code, name, worker_type, joined_date
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
    const workers = await sql`SELECT * FROM workers WHERE worker_id = ${req.params.id} AND is_deleted = false`;
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

    const [existingWorker] = await sql`SELECT * FROM workers WHERE worker_id = ${req.params.id} AND is_deleted = false`;
    if (!existingWorker) return res.status(404).json({ error: 'Worker not found' });

    const updates = {
      name: name !== undefined ? (typeof name === 'string' ? name.trim() : '') : existingWorker.name,
      phone: phone !== undefined ? (phone === null ? null : String(phone).trim() || null) : existingWorker.phone,
      address: address !== undefined ? (address === null ? null : String(address).trim() || null) : existingWorker.address,
      blood_group: blood_group !== undefined ? (blood_group === null ? null : String(blood_group).trim() || null) : existingWorker.blood_group,
      worker_type: worker_type !== undefined ? (worker_type === null ? null : String(worker_type).trim() || null) : existingWorker.worker_type,
      is_active: is_active !== undefined ? Boolean(is_active) : existingWorker.is_active,
      joined_date: joined_date !== undefined ? (typeof joined_date === 'string' ? joined_date.trim() : joined_date) || null : existingWorker.joined_date,
      monthly_wage: monthly_wage !== undefined ? (Number(monthly_wage) >= 0 ? Number(monthly_wage) : 0) : existingWorker.monthly_wage
    };

    if (!updates.name || !updates.joined_date) {
      return res.status(400).json({ error: 'Name and joining date are required.' });
    }

    if (aadhaar !== undefined) {
      if (aadhaar === '••••••••••••') {
        updates.aadhaar_encrypted = existingWorker.aadhaar_encrypted;
      } else if (aadhaar === null || aadhaar === '') {
        updates.aadhaar_encrypted = null;
      } else {
        try {
          updates.aadhaar_encrypted = encrypt(String(aadhaar).trim());
        } catch (encryptErr) {
          console.error('Encryption error:', encryptErr.message);
          return res.status(500).json({ error: 'Encryption failed: ' + encryptErr.message });
        }
      }
    } else {
      updates.aadhaar_encrypted = existingWorker.aadhaar_encrypted;
    }

    const [updated] = await sql`
      UPDATE workers SET
        name = ${updates.name},
        phone = ${updates.phone},
        address = ${updates.address},
        aadhaar_encrypted = ${updates.aadhaar_encrypted},
        blood_group = ${updates.blood_group},
        worker_type = ${updates.worker_type},
        is_active = ${updates.is_active},
        joined_date = ${updates.joined_date},
        monthly_wage = ${updates.monthly_wage}
      WHERE worker_id = ${req.params.id}
      RETURNING worker_id
    `;

    if (!updated) return res.status(404).json({ error: 'Worker not found' });

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
    const [worker] = await sql`
      UPDATE workers
      SET is_deleted = true, is_active = false
      WHERE worker_id = ${req.params.id} AND is_deleted = false
      RETURNING worker_id
    `;
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ message: 'Worker archived' });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({ error: 'Unable to archive worker' });
  }
});

module.exports = router;
