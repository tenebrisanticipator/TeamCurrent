require('dotenv').config();
const { sql } = require('../config/db');
const bcrypt = require('bcrypt');

async function setupDatabase() {
  try {
    console.log('Starting NeonDB Schema Setup...');

    // 1. users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL,
        role VARCHAR CHECK (role IN ('admin','manager')) NOT NULL,
        worker_id UUID,
        is_active BOOLEAN DEFAULT true,
        permissions JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 2. categories
    await sql`
      CREATE TABLE IF NOT EXISTS categories (
        category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 3. items
    await sql`
      CREATE TABLE IF NOT EXISTS items (
        item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        category_id UUID REFERENCES categories(category_id),
        total_quantity INTEGER DEFAULT 0,
        available_quantity INTEGER DEFAULT 0,
        unit VARCHAR DEFAULT 'pcs',
        description TEXT,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 4. suppliers
    await sql`
      CREATE TABLE IF NOT EXISTS suppliers (
        supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name VARCHAR NOT NULL,
        contact_person VARCHAR,
        phone VARCHAR,
        email VARCHAR,
        address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 5. purchases
    await sql`
      CREATE TABLE IF NOT EXISTS purchases (
        purchase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID REFERENCES items(item_id),
        supplier_id UUID REFERENCES suppliers(supplier_id),
        quantity INTEGER NOT NULL,
        purchase_date DATE NOT NULL,
        notes TEXT,
        added_by UUID REFERENCES users(user_id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 6. workers
    // Note: The users table has a circular reference with workers for manager linkage.
    // The foreign key constraint in users is added conceptually if needed, 
    // but in schema definition we leave it as UUID to avoid strict strict circularity during creation.
    await sql`
      CREATE TABLE IF NOT EXISTS workers (
        worker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_code VARCHAR UNIQUE NOT NULL,
        name VARCHAR NOT NULL,
        phone VARCHAR,
        address TEXT,
        aadhaar_encrypted TEXT,
        blood_group VARCHAR,
        worker_type VARCHAR CHECK (worker_type IN ('manager','normal','driver')),
        daily_wage_base DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        joined_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 7. events
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_name VARCHAR NOT NULL,
        client_company VARCHAR,
        client_contact VARCHAR,
        place VARCHAR,
        event_date DATE,
        event_time TIME,
        status VARCHAR DEFAULT 'upcoming' CHECK (status IN ('upcoming','ongoing','closed')),
        created_by UUID REFERENCES users(user_id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 8. event_workers
    await sql`
      CREATE TABLE IF NOT EXISTS event_workers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES events(event_id),
        worker_id UUID REFERENCES workers(worker_id),
        assigned_at TIMESTAMP DEFAULT NOW(),
        assigned_by UUID REFERENCES users(user_id),
        role_note VARCHAR
      );
    `;

    // 9. event_items
    await sql`
      CREATE TABLE IF NOT EXISTS event_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES events(event_id),
        item_id UUID REFERENCES items(item_id),
        quantity_assigned INTEGER NOT NULL,
        quantity_returned INTEGER DEFAULT 0,
        quantity_missing INTEGER GENERATED ALWAYS AS (quantity_assigned - quantity_returned) STORED,
        assigned_at TIMESTAMP DEFAULT NOW(),
        returned_at TIMESTAMP,
        assigned_by UUID REFERENCES users(user_id),
        returned_by UUID REFERENCES users(user_id)
      );
    `;

    // 10. attendance
    await sql`
      CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id UUID REFERENCES workers(worker_id),
        date DATE NOT NULL,
        status VARCHAR DEFAULT 'present' CHECK (status IN ('present','absent')),
        location_note VARCHAR DEFAULT 'Godown',
        event_id UUID REFERENCES events(event_id),
        marked_by UUID REFERENCES users(user_id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(worker_id, date)
      );
    `;

    console.log('Tables created or already exist.');

    // Create Indexes
    console.log('Creating Indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_items_cursor ON items(created_at DESC, item_id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchases_cursor ON purchases(created_at DESC, purchase_id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchases_item ON purchases(item_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_cursor ON events(created_at DESC, event_id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_items_event ON event_items(event_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_event_workers_event ON event_workers(event_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attendance_worker_date ON attendance(worker_id, date DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workers_type ON workers(worker_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workers_cursor ON workers(created_at DESC, worker_id DESC)`;

    console.log('Indexes created.');

    // Insert Default Admin
    console.log('Checking for default admin...');
    const adminEmail = 'admin@teamcurrent.com';
    const existingAdmin = await sql`SELECT user_id FROM users WHERE email = ${adminEmail}`;
    
    if (existingAdmin.length === 0) {
      console.log('Inserting default admin seed...');
      const passwordHash = await bcrypt.hash('Admin@TC2024', 12);
      await sql`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ('System Admin', ${adminEmail}, ${passwordHash}, 'admin')
      `;
      console.log('Default admin seeded.');
    } else {
      console.log('Default admin already exists.');
    }

    console.log('Database setup completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error during database setup:', error);
    process.exit(1);
  }
}

setupDatabase();
