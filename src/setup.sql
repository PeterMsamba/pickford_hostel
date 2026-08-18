-- 1. Roles Table
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

-- Seed Default Roles
INSERT INTO roles (role_name) 
VALUES ('landlord'), ('resident'), ('admin')
ON CONFLICT (role_name) DO NOTHING;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role_id INT REFERENCES roles(role_id) ON DELETE CASCADE,
    program_of_study VARCHAR(150),
    semester VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    room_id SERIAL PRIMARY KEY,
    room_number VARCHAR(20) UNIQUE NOT NULL,
    monthly_rate DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'available'
);

-- 4. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    booking_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    room_id INT REFERENCES rooms(room_id) ON DELETE CASCADE,
    booking_status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    payment_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    room_id INT REFERENCES rooms(room_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_month INT NOT NULL,
    payment_year INT NOT NULL,
    tx_ref VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);