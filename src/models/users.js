import db from './db.js';

export async function createUser(name, email, phone, passwordHash, roleName = 'resident') {
    const query = `
        INSERT INTO users (name, email, phone, password_hash, role_id)
        VALUES ($1, $2, $3, $4, (SELECT role_id FROM roles WHERE role_name = $5))
        RETURNING user_id;
    `;
    const result = await db.query(query, [name, email, phone, passwordHash, roleName]);
    return result.rows[0].user_id;
}

export async function getUserByEmail(email) {
    const query = `
        SELECT u.user_id, u.name, u.email, u.phone, u.password_hash, r.role_name 
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.email = $1;
    `;
    const result = await db.query(query, [email]);
    return result.rows[0] || null;
}

export async function getResidentsWithRentStatus(month, year) {
    const query = `
        SELECT 
            u.user_id,
            u.name AS resident_name,
            u.phone AS resident_phone,
            r.room_number,
            r.monthly_rate,
            COALESCE(p.status, 'unpaid') AS payment_status,
            p.created_at AS payment_date
        FROM users u
        JOIN roles ro ON u.role_id = ro.role_id
        JOIN bookings b ON u.user_id = b.user_id AND b.booking_status = 'confirmed'
        JOIN rooms r ON b.room_id = r.room_id
        LEFT JOIN payments p ON u.user_id = p.user_id 
                            AND r.room_id = p.room_id 
                            AND p.payment_month = $1 
                            AND p.payment_year = $2
                            AND p.status = 'successful'
        WHERE ro.role_name = 'resident'
        ORDER BY r.room_number ASC;
    `;
    const result = await db.query(query, [month, year]);
    return result.rows;
}