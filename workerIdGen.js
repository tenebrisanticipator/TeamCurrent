const { sql } = require('../config/db');

async function generateWorkerId() {
  // Try to find the max existing worker id number
  const result = await sql`
    SELECT worker_code 
    FROM workers 
    WHERE worker_code LIKE 'TC-W-%'
    ORDER BY worker_code DESC 
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return 'TC-W-0001';
  }

  const lastCode = result[0].worker_code;
  const lastNumber = parseInt(lastCode.split('-')[2], 10);
  
  if (isNaN(lastNumber)) {
    return 'TC-W-0001';
  }

  const nextNumber = lastNumber + 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');
  
  return `TC-W-${paddedNumber}`;
}

module.exports = { generateWorkerId };
