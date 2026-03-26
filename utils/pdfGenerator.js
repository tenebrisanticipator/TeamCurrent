const PDFDocument = require('pdfkit');
const { sql } = require('../config/db');

// Helper to draw Team Current Header
function drawHeader(doc, title) {
  // Amber square for TC logo
  doc.rect(50, 45, 40, 40).fill('#F5A623');
  doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold').text('TC', 55, 55);

  // Text Header
  doc.fillColor('#0D1B2A').fontSize(26).font('Helvetica-Bold').text('TEAM CURRENT', 105, 45, { characterSpacing: 1.5 });
  doc.fillColor('#7A9BB5').fontSize(11).font('Helvetica').text('Lighting Solutions for Every Event', 105, 72);

  // Amber full width rule
  doc.strokeColor('#F5A623').lineWidth(2).moveTo(50, 100).lineTo(550, 100).stroke();

  // Address block placeholder
  doc.fillColor('#2C2C2C').fontSize(9)
     .text('123 Godown Road, Industrial AreanPhone: +91 90000 00000nEmail: contact@teamcurrent.com', 400, 50, { align: 'right' });

  // Document Title
  doc.moveDown(3);
  doc.fillColor('#0D1B2A').fontSize(18).font('Helvetica-Bold').text(title, 50, doc.y, { align: 'center' });
  doc.moveDown(2);
}

// Helper to draw footer
function drawFooter(doc, authorizedBy) {
  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const bottom = doc.page.height - 50;

  doc.strokeColor('#1E3A52').lineWidth(1).moveTo(50, bottom - 20).lineTo(550, bottom - 20).stroke();
  
  doc.fillColor('#7A9BB5').fontSize(9).font('Helvetica')
     .text(`Generated on: ${dateStr}`, 50, bottom)
     .text(`Authorized by: ${authorizedBy}`, 50, bottom + 12);
}

async function generatePurchasePDF(purchaseId, res) {
  const purchases = await sql`
    SELECT p.*, i.name as item_name, s.company_name, s.contact_person, s.phone, s.address, u.name as admin_name
    FROM purchases p 
    JOIN items i ON p.item_id = i.item_id 
    JOIN suppliers s ON p.supplier_id = s.supplier_id
    LEFT JOIN users u ON p.added_by = u.user_id
    WHERE p.purchase_id = ${purchaseId}
  `;
  
  if (purchases.length === 0) {
    return res.status(404).json({ error: 'Purchase not found' });
  }
  const data = purchases[0];

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-disposition', `attachment; filename="Purchase_Order_${purchaseId}.pdf"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  drawHeader(doc, 'PURCHASE ORDER');

  doc.fontSize(12).font('Helvetica-Bold').text('Supplier Details:', 50, doc.y);
  doc.font('Helvetica').text(`Company: ${data.company_name}`);
  doc.text(`Contact: ${data.contact_person || 'N/A'}`);
  doc.text(`Phone: ${data.phone || 'N/A'}`);
  doc.text(`Address: ${data.address || 'N/A'}`);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Order Details:', 50, doc.y);
  
  // Table Header
  const tableTop = doc.y + 10;
  doc.rect(50, tableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Item', 60, tableTop + 7);
  doc.text('Quantity', 300, tableTop + 7);
  doc.text('Date', 420, tableTop + 7);

  // Table Row
  doc.fillColor('#2C2C2C').font('Helvetica');
  doc.rect(50, tableTop + 25, 500, 25).stroke('#1E3A52');
  doc.text(data.item_name, 60, tableTop + 32);
  doc.text(data.quantity.toString(), 300, tableTop + 32);
  doc.text(new Date(data.purchase_date).toLocaleDateString('en-IN'), 420, tableTop + 32);

  if (data.notes) {
    doc.moveDown(3);
    doc.font('Helvetica-Bold').text('Notes:');
    doc.font('Helvetica').text(data.notes);
  }

  drawFooter(doc, data.admin_name || 'System Auto');
  doc.end();
}

async function generateEventChallanPDF(eventId, res) {
  const events = await sql`
    SELECT e.*, u.name as admin_name FROM events e 
    LEFT JOIN users u ON e.created_by = u.user_id 
    WHERE e.event_id = ${eventId}
  `;
  if (events.length === 0) return res.status(404).json({ error: 'Event not found' });
  const ev = events[0];

  const items = await sql`
    SELECT ei.*, i.name as item_name, i.unit 
    FROM event_items ei JOIN items i ON ei.item_id = i.item_id
    WHERE ei.event_id = ${eventId}
  `;

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-disposition', `attachment; filename="Delivery_Challan_${eventId}.pdf"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  drawHeader(doc, 'DELIVERY CHALLAN');

  doc.fontSize(12).font('Helvetica-Bold').text('Event Information:', 50, doc.y);
  doc.font('Helvetica')
     .text(`Event Name: ${ev.event_name}`)
     .text(`Client: ${ev.client_company}`)
     .text(`Venue: ${ev.place}`)
     .text(`Date: ${new Date(ev.event_date).toLocaleDateString('en-IN')} ${ev.event_time}`)
     .text(`Status: ${ev.status.toUpperCase()}`);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Equipment Assigned:', 50, doc.y);
  
  const tableTop = doc.y + 10;
  doc.rect(50, tableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Item Name', 60, tableTop + 7);
  doc.text('Assigned', 280, tableTop + 7);
  doc.text('Returned', 360, tableTop + 7);
  doc.text('Missing', 440, tableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  let currentY = tableTop + 25;
  
  items.forEach((it, idx) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(it.item_name, 60, currentY + 7);
    doc.text(`${it.quantity_assigned} ${it.unit}`, 280, currentY + 7);
    doc.text(`${it.quantity_returned} ${it.unit}`, 360, currentY + 7);
    doc.text(`${it.quantity_missing} ${it.unit}`, 440, currentY + 7);
    currentY += 25;
    
    // Add new page if table runs too long
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  drawFooter(doc, ev.admin_name || 'System Auto');
  doc.end();
}

async function generateEventChallanWithLogsPDF(eventId, res) {
  const events = await sql`
    SELECT e.*, u.name as admin_name FROM events e 
    LEFT JOIN users u ON e.created_by = u.user_id 
    WHERE e.event_id = ${eventId}
  `;
  if (events.length === 0) return res.status(404).json({ error: 'Event not found' });
  const ev = events[0];

  const items = await sql`
    SELECT ei.*, i.name as item_name, i.unit, 
           ua.name as assigned_by_name, ur.name as returned_by_name
    FROM event_items ei 
    JOIN items i ON ei.item_id = i.item_id
    LEFT JOIN users ua ON ei.assigned_by = ua.user_id
    LEFT JOIN users ur ON ei.returned_by = ur.user_id
    WHERE ei.event_id = ${eventId}
  `;

  const workers = await sql`
    SELECT ew.*, w.name as worker_name, w.worker_code, ua.name as assigned_by_name
    FROM event_workers ew
    JOIN workers w ON ew.worker_id = w.worker_id
    LEFT JOIN users ua ON ew.assigned_by = ua.user_id
    WHERE ew.event_id = ${eventId}
  `;

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-disposition', `attachment; filename="Delivery_Challan_With_Logs_${eventId}.pdf"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  drawHeader(doc, 'DELIVERY CHALLAN WITH LOGS');

  doc.fontSize(12).font('Helvetica-Bold').text('Event Information:', 50, doc.y);
  doc.font('Helvetica')
     .text(`Event Name: ${ev.event_name}`)
     .text(`Client: ${ev.client_company}`)
     .text(`Venue: ${ev.place}`)
     .text(`Date: ${new Date(ev.event_date).toLocaleDateString('en-IN')} ${ev.event_time}`)
     .text(`Status: ${ev.status.toUpperCase()}`);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Equipment Assignment Logs:', 50, doc.y);
  
  const tableTop = doc.y + 10;
  doc.rect(50, tableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Item Name', 60, tableTop + 7);
  doc.text('Qty', 250, tableTop + 7);
  doc.text('Assigned By', 300, tableTop + 7);
  doc.text('Assigned At', 400, tableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  let currentY = tableTop + 25;
  
  items.forEach((it, idx) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(it.item_name, 60, currentY + 7);
    doc.text(`${it.quantity_assigned} ${it.unit}`, 250, currentY + 7);
    doc.text(it.assigned_by_name || 'Unknown', 300, currentY + 7);
    doc.text(it.assigned_at ? new Date(it.assigned_at).toLocaleString('en-IN') : '-', 400, currentY + 7);
    currentY += 25;
    
    // Add new page if table runs too long
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Equipment Return Logs:', 50, doc.y);
  
  const returnTableTop = doc.y + 10;
  doc.rect(50, returnTableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Item Name', 60, returnTableTop + 7);
  doc.text('Returned Qty', 250, returnTableTop + 7);
  doc.text('Returned By', 320, returnTableTop + 7);
  doc.text('Returned At', 400, returnTableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  currentY = returnTableTop + 25;
  
  items.filter(it => it.quantity_returned > 0).forEach((it, idx) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(it.item_name, 60, currentY + 7);
    doc.text(`${it.quantity_returned} ${it.unit}`, 250, currentY + 7);
    doc.text(it.returned_by_name || 'Unknown', 320, currentY + 7);
    doc.text(it.returned_at ? new Date(it.returned_at).toLocaleString('en-IN') : '-', 400, currentY + 7);
    currentY += 25;
    
    // Add new page if table runs too long
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Staff Assignment Logs:', 50, doc.y);
  
  const workerTableTop = doc.y + 10;
  doc.rect(50, workerTableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Worker Name', 60, workerTableTop + 7);
  doc.text('Code', 250, workerTableTop + 7);
  doc.text('Assigned By', 300, workerTableTop + 7);
  doc.text('Assigned At', 400, workerTableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  currentY = workerTableTop + 25;
  
  workers.forEach((w) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(w.worker_name, 60, currentY + 7);
    doc.text(w.worker_code, 250, currentY + 7);
    doc.text(w.assigned_by_name || 'Unknown', 300, currentY + 7);
    doc.text(w.assigned_at ? new Date(w.assigned_at).toLocaleString('en-IN') : '-', 400, currentY + 7);
    currentY += 25;
    
    // Add new page if table runs too long
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Equipment Summary:', 50, doc.y);
  const summaryTableTop = doc.y + 10;
  doc.rect(50, summaryTableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Item Name', 60, summaryTableTop + 7);
  doc.text('Assigned', 250, summaryTableTop + 7);
  doc.text('Returned', 320, summaryTableTop + 7);
  doc.text('Missing', 400, summaryTableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  currentY = summaryTableTop + 25;
  
  items.forEach((it, idx) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(it.item_name, 60, currentY + 7);
    doc.text(`${it.quantity_assigned} ${it.unit}`, 250, currentY + 7);
    doc.text(`${it.quantity_returned} ${it.unit}`, 320, currentY + 7);
    doc.text(`${it.quantity_missing} ${it.unit}`, 400, currentY + 7);
    currentY += 25;
    
    // Add new page if table runs too long
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  drawFooter(doc, ev.admin_name || 'System Auto');
  doc.end();
}

async function generateWorkerAttendancePDF(workerId, monthStr, res) {
  // monthStr is YYYY-MM
  const workers = await sql`SELECT worker_code, name, worker_type FROM workers WHERE worker_id = ${workerId}`;
  if (workers.length === 0) return res.status(404).json({ error: 'Worker not found' });
  const worker = workers[0];

  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-31`;

  const attendance = await sql`
    SELECT date, status, location_note FROM attendance 
    WHERE worker_id = ${workerId} AND date >= ${startDate} AND date <= ${endDate}
    ORDER BY date ASC
  `;

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-disposition', `attachment; filename="Attendance_${worker.worker_code}_${monthStr}.pdf"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  drawHeader(doc, 'MONTHLY ATTENDANCE REPORT');

  doc.fontSize(12).font('Helvetica-Bold').text('Worker Details:', 50, doc.y);
  doc.font('Helvetica')
     .text(`Code: ${worker.worker_code}`)
     .text(`Name: ${worker.name}`)
     .text(`Role: ${worker.worker_type.toUpperCase()}`)
     .text(`Month: ${monthStr}`);

  doc.moveDown(2);
  const tableTop = doc.y + 10;
  doc.rect(50, tableTop, 500, 25).fill('#1A3048');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold');
  doc.text('Date', 60, tableTop + 7);
  doc.text('Status', 200, tableTop + 7);
  doc.text('Location / Duty', 350, tableTop + 7);

  doc.fillColor('#2C2C2C').font('Helvetica');
  let currentY = tableTop + 25;
  
  attendance.forEach((a) => {
    doc.rect(50, currentY, 500, 25).stroke('#1E3A52');
    doc.text(new Date(a.date).toLocaleDateString('en-IN'), 60, currentY + 7);
    doc.text(a.status.toUpperCase(), 200, currentY + 7);
    doc.text(a.location_note || '-', 350, currentY + 7);
    currentY += 25;
    
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = 50;
    }
  });

  drawFooter(doc, 'System Generated');
  doc.end();
}

module.exports = { generatePurchasePDF, generateEventChallanPDF, generateEventChallanWithLogsPDF, generateWorkerAttendancePDF };
