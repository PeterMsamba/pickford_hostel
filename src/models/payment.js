import db from './db.js';

export async function createPaymentRecord(userId, roomId, amount, month, year, txRef) {
    const query = `
        INSERT INTO payments (user_id, room_id, amount, payment_month, payment_year, tx_ref, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending');
    `;
    await db.query(query, [userId, roomId, amount, month, year, txRef]);
}

export async function updatePaymentStatus(txRef, status) {
    const query = `UPDATE payments SET status = $1 WHERE tx_ref = $2;`;
    await db.query(query, [status, txRef]);
}

export async function checkRentPaymentStatus(userId, roomId, month, year) {
    const query = `
        SELECT status FROM payments 
        WHERE user_id = $1 AND room_id = $2 
          AND payment_month = $3 AND payment_year = $4 
          AND status = 'successful';
    `;
    const result = await db.query(query, [userId, roomId, month, year]);
    return result.rows.length > 0;
}