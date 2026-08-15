import express from 'express';
import axios from 'axios';
import db from './models/db.js';

const router = express.Router();

// ==========================================
// MIDDLEWARE: AUTHENTICATION & ROLE GUARDS
// ==========================================

// Ensure user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
        }
        return res.redirect('/login');
    }
    next();
};

// Ensure user has specific role ('resident' or 'landlord')
const requireRole = (roleName) => {
    return (req, res, next) => {
        if (!req.session.user || req.session.user.role_name !== roleName) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ success: false, message: 'Forbidden. Insufficient permissions.' });
            }
            return res.status(403).send('Access Denied');
        }
        next();
    };
};

// ==========================================
// PAGE VIEW ROUTES (EJS RENDERING)
// ==========================================

// Root Redirect Handler
router.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return req.session.user.role_name === 'landlord'
            ? res.redirect('/landlord/dashboard')
            : res.redirect('/resident/dashboard');
    }
    res.redirect('/login');
});

// Render Login Page
router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

// Render Registration Page
router.get('/register', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { error: null });
});

// Render Resident Dashboard Page
router.get('/resident/dashboard', requireAuth, requireRole('resident'), (req, res) => {
    res.render('resident-dashboard', { user: req.session.user });
});

// Render Landlord Dashboard Page
router.get('/landlord/dashboard', requireAuth, requireRole('landlord'), (req, res) => {
    res.render('landlord-dashboard', { user: req.session.user });
});

// ==========================================
// AUTHENTICATION API & FORM ROUTES
// ==========================================

// User Registration Handler
router.post('/register', async (req, res) => {
    const { name, email, phone, password, role } = req.body;
    const isJson = req.headers['content-type']?.includes('application/json');
    const userRole = role || 'resident';

    if (!name || !email || !password) {
        const msg = 'Name, email, and password are required.';
        if (isJson) return res.status(400).json({ success: false, message: msg });
        return res.render('register', { error: msg });
    }

    try {
        const existingUser = await db.query(
            `SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (existingUser.rows.length > 0) {
            const msg = 'An account with this email already exists.';
            if (isJson) return res.status(400).json({ success: false, message: msg });
            return res.render('register', { error: msg });
        }

        const roleRes = await db.query(
            `SELECT role_id FROM roles WHERE role_name = $1`,
            [userRole]
        );

        if (roleRes.rows.length === 0) {
            const msg = 'Invalid user role specified.';
            if (isJson) return res.status(400).json({ success: false, message: msg });
            return res.render('register', { error: msg });
        }

        const roleId = roleRes.rows[0].role_id;

        const insertQuery = `
            INSERT INTO users (name, email, phone, password, role_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING user_id, name, email
        `;
        const newUserRes = await db.query(insertQuery, [
            name.trim(),
            email.trim().toLowerCase(),
            phone ? phone.trim() : null,
            password,
            roleId
        ]);

        const newUser = newUserRes.rows[0];

        req.session.user = {
            user_id: newUser.user_id,
            name: newUser.name,
            email: newUser.email,
            role_name: userRole
        };

        const redirectUrl = userRole === 'landlord' ? '/landlord/dashboard' : '/resident/dashboard';

        if (isJson) {
            return res.json({ success: true, redirectUrl });
        }

        return res.redirect(redirectUrl);

    } catch (err) {
        console.error('Registration Error:', err);
        const msg = err.message || 'Internal server error during registration.';
        if (isJson) return res.status(500).json({ success: false, message: msg });
        return res.render('register', { error: msg });
    }
});

// User Login Handler
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const isJson = req.headers['content-type']?.includes('application/json');

    if (!email || !password) {
        const msg = 'Please fill in both email and password.';
        if (isJson) return res.status(400).json({ success: false, message: msg });
        return res.render('login', { error: msg });
    }

    try {
        const userQuery = `
            SELECT u.user_id, u.name, u.email, u.password, r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE LOWER(u.email) = LOWER($1)
        `;
        const result = await db.query(userQuery, [email.trim()]);

        if (result.rows.length === 0 || result.rows[0].password !== password) {
            const msg = 'Invalid email or password.';
            if (isJson) return res.status(400).json({ success: false, message: msg });
            return res.render('login', { error: msg });
        }

        const user = result.rows[0];

        req.session.user = {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_name: user.role_name
        };

        const redirectUrl = user.role_name === 'landlord' ? '/landlord/dashboard' : '/resident/dashboard';

        if (isJson) {
            return res.json({ success: true, redirectUrl });
        }

        return res.redirect(redirectUrl);

    } catch (err) {
        console.error('Login Error:', err);
        const msg = err.message || 'Internal server error during login.';
        if (isJson) return res.status(500).json({ success: false, message: msg });
        return res.render('login', { error: msg });
    }
});

// User Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// ==========================================
// RESIDENT API ROUTES
// ==========================================

// Fetch Resident Dashboard Status
router.get('/api/resident/dashboard', requireAuth, requireRole('resident'), async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

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

// Book a Room
router.post('/api/resident/book', requireAuth, requireRole('resident'), async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { roomId } = req.body;

        if (!roomId) {
            return res.status(400).json({ success: false, message: 'Room ID is required.' });
        }

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

// Initiate Rent Payment via PayChangu (Airtel / TNM)
router.post('/api/resident/pay-rent', requireAuth, requireRole('resident'), async (req, res) => {
    const { mobile, amount, email, month, year, roomId } = req.body;
    const userId = req.session.user.user_id;
    const txRef = `RENT-${userId}-${Date.now()}`;

    try {
        await db.query(
            `INSERT INTO payments (user_id, room_id, amount, payment_month, payment_year, tx_ref, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [userId, roomId, amount, month, year, txRef]
        );

        const response = await axios.post(
            'https://api.paychangu.com/payment',
            {
                amount: parseFloat(amount),
                currency: 'MWK',
                email: email ? email.trim() : req.session.user.email,
                first_name: req.session.user.name || 'Resident',
                last_name: 'Resident',
                mobile: mobile.trim(),
                callback_url: `${process.env.APP_URL}/api/webhook`,
                return_url: `${process.env.APP_URL}/resident/dashboard`,
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
        return res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
    }
});

// ==========================================
// WEBHOOK ROUTE
// ==========================================

// PayChangu Webhook Handler
router.post('/api/webhook', async (req, res) => {
    try {
        const { tx_ref, status } = req.body;
        const paymentStatus = status === 'success' ? 'successful' : 'failed';

        if (tx_ref) {
            await db.query(
                `UPDATE payments SET status = $1 WHERE tx_ref = $2`,
                [paymentStatus, tx_ref]
            );
        }
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send('Webhook Processing Error');
    }
});

// ==========================================
// LANDLORD API ROUTES
// ==========================================

// Fetch All Residents & Monthly Rent Status
router.get('/api/landlord/residents-report', requireAuth, requireRole('landlord'), async (req, res) => {
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

export default router;