-- 1. Roles Table
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (role_name) VALUES ('landlord'), ('resident');

-- 2. Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Rooms Table
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    room_number VARCHAR(20) UNIQUE NOT NULL,
    monthly_rate DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'available' -- 'available', 'occupied'
);

-- Insert baseline room records
INSERT INTO rooms (room_number, monthly_rate) VALUES 
('Room 101', 45000.00),
('Room 102', 45000.00),
('Room 201', 50000.00);

-- 4. Bookings Table
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(room_id) ON DELETE CASCADE,
    booking_status VARCHAR(20) DEFAULT 'confirmed', -- 'pending', 'confirmed', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Rent Payments Table
CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(room_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_month INTEGER NOT NULL, -- 1 through 12
    payment_year INTEGER NOT NULL,  -- e.g. 2026
    tx_ref VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'successful', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);