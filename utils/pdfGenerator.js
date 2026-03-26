const PDFDocument = require('pdfkit');
const { sql } = require('../config/db');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const COLOR = {
  brand:       '#F5A623',   // amber accent
  headerBg:    '#0D1B2A',   // dark navy – table headers
  headerText:  '#FFFFFF',
  bodyText:    '#1A1A1A',
  mutedText:   '#6B7C8F',
  rowAlt:      '#F7F9FB',   // zebra stripe
  rowBorder:   '#DDE4EC',
  sectionHead: '#0D1B2A',
  pageW:       595.28,      // A4 points
  pageH:       841.89,
  marginL:     45,
  marginR:     45,
  contentW:    505,         // pageW - marginL - marginR
};

// ─── HEADER ───────────────────────────────────────────────────────────────────
function drawHeader(doc, title) {
  const L = COLOR.marginL;

  // Amber logo block
  doc.rect(L, 35, 44, 44).fill(COLOR.brand);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('TC', L + 9, 47, { width: 26, align: 'center' });

  // Company name + tagline (absolute, right of logo)
  doc
    .fillColor(COLOR.sectionHead)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('TEAM CURRENT', L + 54, 38, { characterSpacing: 1.2, lineBreak: false });

  doc
    .fillColor(COLOR.mutedText)
    .font('Helvetica')
    .fontSize(9.5)
    .text('Lighting Solutions for Every Event', L + 54, 62, { lineBreak: false });

  // Contact block – right-aligned, no overlap
  const contactLines = [
    '123 Godown Road, Industrial Area',
    'Phone: +91 90000 00000',
    'Email: contact@teamcurrent.com',
  ];
  let cy = 38;
  contactLines.forEach((line) => {
    doc
      .fillColor(COLOR.mutedText)
      .font('Helvetica')
      .fontSize(8.5)
      .text(line, L, cy, { width: COLOR.contentW, align: 'right', lineBreak: false });
    cy += 13;
  });

  // Amber rule
  doc
    .strokeColor(COLOR.brand)
    .lineWidth(2)
    .moveTo(L, 90)
    .lineTo(L + COLOR.contentW, 90)
    .stroke();

  // Document title, centred between rules
  doc
    .fillColor(COLOR.sectionHead)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(title, L, 100, { width: COLOR.contentW, align: 'center', lineBreak: false });

  // Thin rule below title
  doc
    .strokeColor(COLOR.rowBorder)
    .lineWidth(0.5)
    .moveTo(L, 118)
    .lineTo(L + COLOR.contentW, 118)
    .stroke();

  // Return the Y cursor below the header
  return 132;
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function drawFooter(doc, authorizedBy) {
  const L = COLOR.marginL;
  const bottom = COLOR.pageH - 38;

  doc
    .strokeColor(COLOR.rowBorder)
    .lineWidth(0.5)
    .moveTo(L, bottom - 14)
    .lineTo(L + COLOR.contentW, bottom - 14)
    .stroke();

  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  doc
    .fillColor(COLOR.mutedText)
    .font('Helvetica')
    .fontSize(8)
    .text(`Generated: ${dateStr}`, L, bottom, { lineBreak: false });

  doc
    .text(`Authorized by: ${authorizedBy}`, L, bottom, {
      width: COLOR.contentW,
      align: 'right',
      lineBreak: false,
    });
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
function sectionLabel(doc, label, y) {
  const L = COLOR.marginL;
  doc
    .fillColor(COLOR.sectionHead)
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .text(label, L, y, { lineBreak: false });
  return y + 16;
}

// ─── INFO GRID (key-value pairs in two columns) ───────────────────────────────
function infoGrid(doc, rows, startY) {
  const L = COLOR.marginL;
  const col2X = L + 260;
  const lineH = 15;
  let y = startY;

  rows.forEach(([key, val], i) => {
    const x = i % 2 === 0 ? L : col2X;
    if (i % 2 === 0 && i > 0) y += lineH;

    doc
      .fillColor(COLOR.mutedText)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`${key}: `, x, y, { continued: true, lineBreak: false });
    doc
      .fillColor(COLOR.bodyText)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(String(val ?? 'N/A'), { lineBreak: false });
  });

  return y + lineH + 6;
}

// ─── TABLE HELPERS ─────────────────────────────────────────────────────────────
const ROW_H = 22;
const FOOTER_SAFE = 80; // leave this many pts before page bottom

function tableHeader(doc, y, cols) {
  const L = COLOR.marginL;

  doc.rect(L, y, COLOR.contentW, ROW_H).fill(COLOR.headerBg);
  doc.fillColor(COLOR.headerText).font('Helvetica-Bold').fontSize(8.5);

  cols.forEach(({ label, x, width, align }) => {
    doc.text(label, x, y + 7, { width: width || 80, align: align || 'left', lineBreak: false });
  });

  return y + ROW_H;
}

function tableRow(doc, y, cols, isAlt) {
  const L = COLOR.marginL;

  if (isAlt) doc.rect(L, y, COLOR.contentW, ROW_H).fill(COLOR.rowAlt);
  doc
    .rect(L, y, COLOR.contentW, ROW_H)
    .strokeColor(COLOR.rowBorder)
    .lineWidth(0.4)
    .stroke();

  doc.fillColor(COLOR.bodyText).font('Helvetica').fontSize(8.5);
  cols.forEach(({ value, x, width, align }) => {
    doc.text(String(value ?? '-'), x, y + 7, {
      width: width || 80,
      align: align || 'left',
      lineBreak: false,
    });
  });

  return y + ROW_H;
}

// Returns new y; adds page if needed (with fresh header continuation)
function safeY(doc, y) {
  if (y > COLOR.pageH - FOOTER_SAFE) {
    doc.addPage();
    return 50;
  }
  return y;
}

// ─── PURCHASE ORDER ───────────────────────────────────────────────────────────
async function generatePurchasePDF(purchaseId, res) {
  const purchases = await sql`
    SELECT p.*, i.name AS item_name,
           s.company_name, s.contact_person, s.phone, s.address,
           u.name AS admin_name
    FROM purchases p
    JOIN items i ON p.item_id = i.item_id
    JOIN suppliers s ON p.supplier_id = s.supplier_id
    LEFT JOIN users u ON p.added_by = u.user_id
    WHERE p.purchase_id = ${purchaseId}
  `;
  if (purchases.length === 0) return res.status(404).json({ error: 'Purchase not found' });
  const d = purchases[0];

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  res.setHeader('Content-Disposition', `attachment; filename="Purchase_Order_${purchaseId}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  let y = drawHeader(doc, 'PURCHASE ORDER');

  // Supplier section
  y = sectionLabel(doc, 'Supplier Details', y);
  y = infoGrid(doc, [
    ['Company',  d.company_name],
    ['Contact',  d.contact_person],
    ['Phone',    d.phone],
    ['Address',  d.address],
  ], y);

  y += 8;
  y = sectionLabel(doc, 'Order Details', y);
  y += 4;

  const cols = [
    { label: 'Item',     x: COLOR.marginL + 6,  width: 200 },
    { label: 'Quantity', x: COLOR.marginL + 260, width: 80  },
    { label: 'Date',     x: COLOR.marginL + 370, width: 100 },
  ];
  y = tableHeader(doc, y, cols);

  y = tableRow(doc, y, [
    { value: d.item_name,  x: COLOR.marginL + 6,  width: 200 },
    { value: d.quantity,   x: COLOR.marginL + 260, width: 80  },
    { value: new Date(d.purchase_date).toLocaleDateString('en-IN'), x: COLOR.marginL + 370, width: 100 },
  ], false);

  if (d.notes) {
    y += 12;
    y = sectionLabel(doc, 'Notes', y);
    doc.fillColor(COLOR.bodyText).font('Helvetica').fontSize(9)
       .text(d.notes, COLOR.marginL, y, { width: COLOR.contentW });
    y = doc.y + 4;
  }

  drawFooter(doc, d.admin_name || 'System Auto');
  doc.end();
}

// ─── DELIVERY CHALLAN ─────────────────────────────────────────────────────────
async function generateEventChallanPDF(eventId, res) {
  const events = await sql`
    SELECT e.*, u.name AS admin_name FROM events e
    LEFT JOIN users u ON e.created_by = u.user_id
    WHERE e.event_id = ${eventId}
  `;
  if (events.length === 0) return res.status(404).json({ error: 'Event not found' });
  const ev = events[0];

  const items = await sql`
    SELECT ei.*, i.name AS item_name, i.unit
    FROM event_items ei
    JOIN items i ON ei.item_id = i.item_id
    WHERE ei.event_id = ${eventId}
  `;

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  res.setHeader('Content-Disposition', `attachment; filename="Delivery_Challan_${eventId}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  let y = drawHeader(doc, 'DELIVERY CHALLAN');

  y = sectionLabel(doc, 'Event Information', y);
  y = infoGrid(doc, [
    ['Event',   ev.event_name],
    ['Client',  ev.client_company],
    ['Venue',   ev.place],
    ['Date',    `${new Date(ev.event_date).toLocaleDateString('en-IN')} ${ev.event_time}`],
    ['Status',  ev.status.toUpperCase()],
  ], y);

  y += 8;
  y = sectionLabel(doc, 'Equipment Assigned', y);
  y += 4;

  const cols = [
    { label: 'Item Name',  x: COLOR.marginL + 6,  width: 200 },
    { label: 'Assigned',   x: COLOR.marginL + 230, width: 80  },
    { label: 'Returned',   x: COLOR.marginL + 320, width: 80  },
    { label: 'Missing',    x: COLOR.marginL + 410, width: 80  },
  ];
  y = tableHeader(doc, y, cols);

  items.forEach((it, idx) => {
    y = safeY(doc, y);
    y = tableRow(doc, y, [
      { value: it.item_name,                          x: COLOR.marginL + 6,  width: 200 },
      { value: `${it.quantity_assigned} ${it.unit}`,  x: COLOR.marginL + 230, width: 80  },
      { value: `${it.quantity_returned} ${it.unit}`,  x: COLOR.marginL + 320, width: 80  },
      { value: `${it.quantity_missing} ${it.unit}`,   x: COLOR.marginL + 410, width: 80  },
    ], idx % 2 === 1);
  });

  drawFooter(doc, ev.admin_name || 'System Auto');
  doc.end();
}

// ─── DELIVERY CHALLAN WITH LOGS ───────────────────────────────────────────────
async function generateEventChallanWithLogsPDF(eventId, res) {
  const events = await sql`
    SELECT e.*, u.name AS admin_name FROM events e
    LEFT JOIN users u ON e.created_by = u.user_id
    WHERE e.event_id = ${eventId}
  `;
  if (events.length === 0) return res.status(404).json({ error: 'Event not found' });
  const ev = events[0];

  const items = await sql`
    SELECT ei.*, i.name AS item_name, i.unit,
           ua.name AS assigned_by_name, ur.name AS returned_by_name
    FROM event_items ei
    JOIN items i ON ei.item_id = i.item_id
    LEFT JOIN users ua ON ei.assigned_by = ua.user_id
    LEFT JOIN users ur ON ei.returned_by = ur.user_id
    WHERE ei.event_id = ${eventId}
  `;

  const workers = await sql`
    SELECT ew.*, w.name AS worker_name, w.worker_code, ua.name AS assigned_by_name
    FROM event_workers ew
    JOIN workers w ON ew.worker_id = w.worker_id
    LEFT JOIN users ua ON ew.assigned_by = ua.user_id
    WHERE ew.event_id = ${eventId}
  `;

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  res.setHeader('Content-Disposition', `attachment; filename="Delivery_Challan_With_Logs_${eventId}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  let y = drawHeader(doc, 'DELIVERY CHALLAN WITH LOGS');

  // Event info
  y = sectionLabel(doc, 'Event Information', y);
  y = infoGrid(doc, [
    ['Event',   ev.event_name],
    ['Client',  ev.client_company],
    ['Venue',   ev.place],
    ['Date',    `${new Date(ev.event_date).toLocaleDateString('en-IN')} ${ev.event_time}`],
    ['Status',  ev.status.toUpperCase()],
  ], y);

  // ── Assignment Logs ──
  y += 8;
  y = sectionLabel(doc, 'Equipment Assignment Logs', y);
  y += 4;

  const assignCols = [
    { label: 'Item Name',    x: COLOR.marginL + 6,  width: 180 },
    { label: 'Qty',          x: COLOR.marginL + 196, width: 60  },
    { label: 'Assigned By',  x: COLOR.marginL + 266, width: 110 },
    { label: 'Assigned At',  x: COLOR.marginL + 386, width: 115 },
  ];
  y = tableHeader(doc, y, assignCols);

  items.forEach((it, idx) => {
    y = safeY(doc, y);
    y = tableRow(doc, y, [
      { value: it.item_name,                                                     x: COLOR.marginL + 6,  width: 180 },
      { value: `${it.quantity_assigned} ${it.unit}`,                             x: COLOR.marginL + 196, width: 60  },
      { value: it.assigned_by_name || 'Unknown',                                 x: COLOR.marginL + 266, width: 110 },
      { value: it.assigned_at ? new Date(it.assigned_at).toLocaleString('en-IN') : '-', x: COLOR.marginL + 386, width: 115 },
    ], idx % 2 === 1);
  });

  // ── Return Logs ──
  const returned = items.filter((it) => it.quantity_returned > 0);
  if (returned.length > 0) {
    y += 10;
    y = safeY(doc, y);
    y = sectionLabel(doc, 'Equipment Return Logs', y);
    y += 4;

    const retCols = [
      { label: 'Item Name',    x: COLOR.marginL + 6,  width: 180 },
      { label: 'Returned Qty', x: COLOR.marginL + 196, width: 70  },
      { label: 'Returned By',  x: COLOR.marginL + 276, width: 110 },
      { label: 'Returned At',  x: COLOR.marginL + 396, width: 110 },
    ];
    y = tableHeader(doc, y, retCols);

    returned.forEach((it, idx) => {
      y = safeY(doc, y);
      y = tableRow(doc, y, [
        { value: it.item_name,                                                      x: COLOR.marginL + 6,  width: 180 },
        { value: `${it.quantity_returned} ${it.unit}`,                              x: COLOR.marginL + 196, width: 70  },
        { value: it.returned_by_name || 'Unknown',                                  x: COLOR.marginL + 276, width: 110 },
        { value: it.returned_at ? new Date(it.returned_at).toLocaleString('en-IN') : '-', x: COLOR.marginL + 396, width: 110 },
      ], idx % 2 === 1);
    });
  }

  // ── Staff Logs ──
  if (workers.length > 0) {
    y += 10;
    y = safeY(doc, y);
    y = sectionLabel(doc, 'Staff Assignment Logs', y);
    y += 4;

    const wCols = [
      { label: 'Worker Name', x: COLOR.marginL + 6,  width: 160 },
      { label: 'Code',        x: COLOR.marginL + 176, width: 80  },
      { label: 'Assigned By', x: COLOR.marginL + 266, width: 120 },
      { label: 'Assigned At', x: COLOR.marginL + 396, width: 110 },
    ];
    y = tableHeader(doc, y, wCols);

    workers.forEach((w, idx) => {
      y = safeY(doc, y);
      y = tableRow(doc, y, [
        { value: w.worker_name,                                                     x: COLOR.marginL + 6,  width: 160 },
        { value: w.worker_code,                                                     x: COLOR.marginL + 176, width: 80  },
        { value: w.assigned_by_name || 'Unknown',                                   x: COLOR.marginL + 266, width: 120 },
        { value: w.assigned_at ? new Date(w.assigned_at).toLocaleString('en-IN') : '-', x: COLOR.marginL + 396, width: 110 },
      ], idx % 2 === 1);
    });
  }

  // ── Summary ──
  y += 10;
  y = safeY(doc, y);
  y = sectionLabel(doc, 'Equipment Summary', y);
  y += 4;

  const sumCols = [
    { label: 'Item Name', x: COLOR.marginL + 6,  width: 200 },
    { label: 'Assigned',  x: COLOR.marginL + 230, width: 80  },
    { label: 'Returned',  x: COLOR.marginL + 320, width: 80  },
    { label: 'Missing',   x: COLOR.marginL + 410, width: 80  },
  ];
  y = tableHeader(doc, y, sumCols);

  items.forEach((it, idx) => {
    y = safeY(doc, y);
    y = tableRow(doc, y, [
      { value: it.item_name,                         x: COLOR.marginL + 6,  width: 200 },
      { value: `${it.quantity_assigned} ${it.unit}`, x: COLOR.marginL + 230, width: 80  },
      { value: `${it.quantity_returned} ${it.unit}`, x: COLOR.marginL + 320, width: 80  },
      { value: `${it.quantity_missing} ${it.unit}`,  x: COLOR.marginL + 410, width: 80  },
    ], idx % 2 === 1);
  });

  drawFooter(doc, ev.admin_name || 'System Auto');
  doc.end();
}

// ─── WORKER ATTENDANCE ────────────────────────────────────────────────────────
async function generateWorkerAttendancePDF(workerId, monthStr, res) {
  const workers = await sql`SELECT worker_code, name, worker_type FROM workers WHERE worker_id = ${workerId}`;
  if (workers.length === 0) return res.status(404).json({ error: 'Worker not found' });
  const worker = workers[0];

  const startDate = `${monthStr}-01`;
  const endDate   = `${monthStr}-31`;

  const attendance = await sql`
    SELECT date, status, location_note FROM attendance
    WHERE worker_id = ${workerId} AND date >= ${startDate} AND date <= ${endDate}
    ORDER BY date ASC
  `;

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  res.setHeader('Content-Disposition', `attachment; filename="Attendance_${worker.worker_code}_${monthStr}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  let y = drawHeader(doc, 'MONTHLY ATTENDANCE REPORT');

  y = sectionLabel(doc, 'Worker Details', y);
  y = infoGrid(doc, [
    ['Code',  worker.worker_code],
    ['Name',  worker.name],
    ['Role',  worker.worker_type.toUpperCase()],
    ['Month', monthStr],
  ], y);

  y += 8;
  y = sectionLabel(doc, 'Attendance Log', y);
  y += 4;

  const cols = [
    { label: 'Date',            x: COLOR.marginL + 6,  width: 120 },
    { label: 'Status',          x: COLOR.marginL + 156, width: 100 },
    { label: 'Location / Duty', x: COLOR.marginL + 276, width: 224 },
  ];
  y = tableHeader(doc, y, cols);

  // Status badge colors
  const statusColor = (s) => {
    const map = { present: '#1A7F4B', absent: '#C0392B', leave: '#7F6A00', holiday: '#1A4A7F' };
    return map[s?.toLowerCase()] || COLOR.bodyText;
  };

  attendance.forEach((a, idx) => {
    y = safeY(doc, y);
    const L = COLOR.marginL;
    if (idx % 2 === 1) doc.rect(L, y, COLOR.contentW, ROW_H).fill(COLOR.rowAlt);
    doc.rect(L, y, COLOR.contentW, ROW_H).strokeColor(COLOR.rowBorder).lineWidth(0.4).stroke();

    doc.fillColor(COLOR.bodyText).font('Helvetica').fontSize(8.5)
       .text(new Date(a.date).toLocaleDateString('en-IN'), L + 6, y + 7, { width: 120, lineBreak: false });

    doc.fillColor(statusColor(a.status)).font('Helvetica-Bold').fontSize(8.5)
       .text(a.status.toUpperCase(), L + 156, y + 7, { width: 100, lineBreak: false });

    doc.fillColor(COLOR.bodyText).font('Helvetica').fontSize(8.5)
       .text(a.location_note || '-', L + 276, y + 7, { width: 224, lineBreak: false });

    y += ROW_H;
  });

  drawFooter(doc, 'System Generated');
  doc.end();
}

module.exports = {
  generatePurchasePDF,
  generateEventChallanPDF,
  generateEventChallanWithLogsPDF,
  generateWorkerAttendancePDF,
};