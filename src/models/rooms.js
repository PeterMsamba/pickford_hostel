import db from './db.js';

export async function getAllAvailableRooms() {
    const query = `SELECT * FROM rooms WHERE status = 'available' ORDER BY room_number ASC;`;
    const result = await db.query(query);
    return result.rows;
}

export async function getResidentBooking(userId) {
    const query = `
        SELECT b.booking_id, r.room_id, r.room_number, r.monthly_rate 
        FROM bookings b
        JOIN rooms r ON b.room_id = r.room_id
        WHERE b.user_id = $1 AND b.booking_status = 'confirmed'
        LIMIT 1;
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
}

export async function createBooking(userId, roomId) {
    await db.query(
        `INSERT INTO bookings (user_id, room_id, booking_status) VALUES ($1, $2, 'confirmed');`,
        [userId, roomId]
    );
    await db.query(`UPDATE rooms SET status = 'occupied' WHERE room_id = $1;`, [roomId]);
}