import express from 'express';
import axios from 'axios';
import db from './models/db.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// RESIDENT ROUTES
// ==========================================

// 1. Fetch Resident Dashboard Status
app.get('/api/resident/dashboard', async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Get user's active room booking
        const bookingQuery = `
            SELECT b.booking_id, r.room_id, r.room_number, r.monthly_rate 
            FROM bookings b
            JOIN rooms r ON b.room_id = r.room_id
            WHERE b.user_id = $1 AND b.booking_status = 'confirmed'
            LIMIT 1
        `;
        const bookingRes = await db.query(bookingQuery, [userId]);
        const booking = bookingRes.rows[0] || null;

        let hasPaidCurrentMonth = false;

        if (booking) {
            // Check current month's payment status
            const payQuery = `
                SELECT status FROM payments 
                WHERE user_id = $1 AND room_id = $2 
                  AND payment_month = $3 AND payment_year = $4 
                  AND status = 'successful'
            `;
            const payRes = await db.query(payQuery, [userId, booking.room_id, currentMonth, currentYear]);
            hasPaidCurrentMonth = payRes.rows.length > 0;
        }

        res.json({ booking, currentMonth, currentYear, hasPaidCurrentMonth });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Book a Room
app.post('/api/resident/book', async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { roomId } = req.body;

        await db.query(
            `INSERT INTO bookings (user_id, room_id, booking_status) VALUES ($1, $2, 'confirmed')`,
            [userId, roomId]
        );
        await db.query(`UPDATE rooms SET status = 'occupied' WHERE room_id = $1`, [roomId]);

        res.json({ success: true, message: 'Room booked successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Initiate Rent Payment via PayChangu (Airtel / TNM)
app.post('/api/resident/pay-rent', async (req, res) => {
    const { mobile, amount, email, month, year, roomId } = req.body;
    const userId = req.session.user.user_id;
    const txRef = `RENT-${userId}-${Date.now()}`;

    try {
        // Record pending payment in database
        await db.query(
            `INSERT INTO payments (user_id, room_id, amount, payment_month, payment_year, tx_ref, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [userId, roomId, amount, month, year, txRef]
        );

        // Initiate PayChangu Charge
        const response = await axios.post(
            'https://api.paychangu.com/payment',
            {
                amount: parseFloat(amount),
                currency: 'MWK',
                email: email.trim(),
                first_name: req.session.user.name,
                last_name: 'Resident',
                mobile: mobile.trim(),
                callback_url: `${process.env.APP_URL}/api/webhook`,
                return_url: `${process.env.APP_URL}/dashboard`,
                tx_ref: txRef,
                customization: {
                    title: 'Hostel Rent Payment',
                    description: `Rent payment for Month ${month}/${year}`
                }
            },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`
                }
            }
        );

        const checkoutUrl = response.data?.data?.checkout_url || response.data?.checkout_url;
        return res.json({ success: true, txRef, checkoutUrl });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 4. PayChangu Webhook Handler
app.post('/api/webhook', async (req, res) => {
    const { tx_ref, status } = req.body;
    const paymentStatus = status === 'success' ? 'successful' : 'failed';

    if (tx_ref) {
        await db.query(
            `UPDATE payments SET status = $1 WHERE tx_ref = $2`,
            [paymentStatus, tx_ref]
        );
    }
    res.sendStatus(200);
});

// ==========================================
// LANDLORD ROUTES
// ==========================================

// Fetch All Residents & Monthly Rent Status
app.get('/api/landlord/residents-report', async (req, res) => {
    try {
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();

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
        res.json({ month, year, residents: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});