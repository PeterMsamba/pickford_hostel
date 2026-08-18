import express from 'express';
import axios from 'axios';
import db from './models/db.js';

const router = express.Router();

// ==========================================
// MIDDLEWARE: AUTHENTICATION & ROLE GUARDS
// ==========================================

// Ensure user is authenticated
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
        }
        return res.redirect('/login');
    }
    next();
};

// Middleware factory to enforce specific role access
const requireRole = (roleName) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
            }
            return res.redirect('/login');
        }

        if (req.session.user.role_name !== roleName) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ success: false, message: 'Forbidden. Insufficient permissions.' });
            }
            return res.status(403).send('Access Denied: Insufficient permissions.');
        }

        next();
    };
};

// ==========================================
// PAGE VIEW ROUTES (EJS RENDERING)
// ==========================================

// Root Navigation Handler
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

// Render Resident Dashboard Page
router.get('/resident/dashboard', requireAuth, requireRole('resident'), async (req, res) => {
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

        res.render('resident-dashboard', { 
            user: req.session.user,
            booking,
            currentMonth,
            currentYear,
            hasPaidCurrentMonth
        });

    } catch (err) {
        console.error('Error rendering resident dashboard:', err);
        res.status(500).send('Internal Server Error: ' + err.message);
    }
});

// ==========================================
// LANDLORD PAGE ROUTES
// ==========================================

// 1. Dashboard View (Overview Stats + Registration Form)
router.get('/landlord/dashboard', requireAuth, requireRole('landlord'), async (req, res) => {
    try {
        const totalResidentsRes = await db.query(
            `SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_name = 'resident'`
        );
        const totalRoomsRes = await db.query(`SELECT COUNT(*) FROM rooms`);
        const occupiedRoomsRes = await db.query(`SELECT COUNT(*) FROM rooms WHERE status = 'occupied'`);

        res.render('landlord-dashboard', { 
            user: req.session.user,
            stats: {
                totalResidents: totalResidentsRes.rows[0].count,
                totalRooms: totalRoomsRes.rows[0].count,
                occupiedRooms: occupiedRoomsRes.rows[0].count
            },
            error: req.query.error || null,
            success: req.query.success || null 
        });
    } catch (err) {
        console.error('Error loading landlord dashboard:', err);
        res.status(500).send('Server Error');
    }
});

// 2. Residents View (Directory & Room Allocations)
router.get('/landlord/residents', requireAuth, requireRole('landlord'), async (req, res) => {
    try {
        const query = `
            SELECT 
                u.user_id,
                u.name,
                u.email,
                u.phone,
                u.program_of_study,
                u.semester,
                COALESCE(r.room_number, 'Unassigned') AS room_number
            FROM users u
            JOIN roles ro ON u.role_id = ro.role_id
            LEFT JOIN bookings b ON u.user_id = b.user_id AND b.booking_status = 'confirmed'
            LEFT JOIN rooms r ON b.room_id = r.room_id
            WHERE ro.role_name = 'resident'
            ORDER BY u.name ASC
        `;
        const result = await db.query(query);

        res.render('landlord-residents', { 
            user: req.session.user, 
            residents: result.rows 
        });
    } catch (err) {
        console.error('Error fetching residents:', err);
        res.status(500).send('Server Error loading residents tab.');
    }
});

// 3. Payments View (Monthly Payment Audit Trail)
router.get('/landlord/payments', requireAuth, requireRole('landlord'), async (req, res) => {
    try {
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const query = `
            SELECT 
                p.payment_id,
                u.name AS resident_name,
                u.email AS resident_email,
                r.room_number,
                p.amount,
                p.payment_month,
                p.payment_year,
                p.tx_ref,
                p.status,
                p.created_at
            FROM payments p
            JOIN users u ON p.user_id = u.user_id
            JOIN rooms r ON p.room_id = r.room_id
            WHERE p.payment_month = $1 AND p.payment_year = $2
            ORDER BY p.created_at DESC
        `;
        const result = await db.query(query, [month, year]);

        res.render('landlord-payments', { 
            user: req.session.user, 
            payments: result.rows,
            selectedMonth: month,
            selectedYear: year
        });
    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).send('Server Error loading payments tab.');
    }
});

// ==========================================
// RESIDENT ROOM BOOKING ROUTES
// ==========================================

router.get('/rooms', requireAuth, requireRole('resident'), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM rooms WHERE status = 'available' ORDER BY room_number ASC`
        );
        res.render('rooms', { user: req.session.user, rooms: result.rows });
    } catch (err) {
        console.error('Error fetching rooms:', err);
        res.status(500).send('Server Error loading rooms.');
    }
});

router.post('/api/resident/book-room', requireAuth, requireRole('resident'), async (req, res) => {
    const { roomId } = req.body;
    const userId = req.session.user.user_id;

    try {
        const existing = await db.query(
            `SELECT booking_id FROM bookings WHERE user_id = $1 AND booking_status = 'confirmed'`,
            [userId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have an active room booking.' });
        }

        await db.query(`BEGIN`);
        await db.query(
            `INSERT INTO bookings (user_id, room_id, booking_status) VALUES ($1, $2, 'confirmed')`,
            [userId, roomId]
        );
        await db.query(`UPDATE rooms SET status = 'occupied' WHERE room_id = $1`, [roomId]);
        await db.query(`COMMIT`);

        return res.json({ success: true, message: 'Room booked successfully!' });
    } catch (err) {
        await db.query(`ROLLBACK`);
        console.error('Booking error:', err);
        return res.status(500).json({ success: false, message: 'Failed to book room.' });
    }
});

// ==========================================
// AUTHENTICATION & REGISTRATION ROUTES
// ==========================================

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
            SELECT u.user_id, u.name, u.email, u.phone, u.password, u.program_of_study, u.semester, r.role_name 
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
        const normalizedRole = user.role_name ? user.role_name.toLowerCase() : 'resident';

        req.session.user = {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            role_name: normalizedRole,
            program_of_study: user.program_of_study,
            semester: user.semester
        };

        const redirectUrl = normalizedRole === 'landlord' ? '/landlord/dashboard' : '/resident/dashboard';

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

router.post('/landlord/register-resident', requireAuth, requireRole('landlord'), async (req, res) => {
    const { name, email, phone, password, program_of_study, semester } = req.body;
    const isJson = req.headers['content-type']?.includes('application/json');

    if (!name || !email || !password || !program_of_study || !semester) {
        const msg = 'Name, email, password, program of study, and semester are required.';
        if (isJson) return res.status(400).json({ success: false, message: msg });
        return res.redirect('/landlord/dashboard?error=' + encodeURIComponent(msg));
    }

    try {
        const existingUser = await db.query(
            `SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (existingUser.rows.length > 0) {
            const msg = 'An account with this email already exists.';
            if (isJson) return res.status(400).json({ success: false, message: msg });
            return res.redirect('/landlord/dashboard?error=' + encodeURIComponent(msg));
        }

        const roleRes = await db.query(`SELECT role_id FROM roles WHERE role_name = 'resident'`);
        if (roleRes.rows.length === 0) {
            const msg = 'Resident role configuration missing in database.';
            if (isJson) return res.status(500).json({ success: false, message: msg });
            return res.redirect('/landlord/dashboard?error=' + encodeURIComponent(msg));
        }

        const roleId = roleRes.rows[0].role_id;

        await db.query(
            `INSERT INTO users (name, email, phone, password, role_id, program_of_study, semester)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                phone ? phone.trim() : null,
                password,
                roleId,
                program_of_study.trim(),
                semester.trim()
            ]
        );

        if (isJson) {
            return res.json({ success: true, message: 'Resident registered successfully.' });
        }

        return res.redirect('/landlord/dashboard?success=' + encodeURIComponent('Resident registered successfully!'));

    } catch (err) {
        console.error('Registration Error:', err);
        const msg = err.message || 'Error processing resident registration.';
        if (isJson) return res.status(500).json({ success: false, message: msg });
        return res.redirect('/landlord/dashboard?error=' + encodeURIComponent(msg));
    }
});

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
// RESIDENT API & PAYMENTS ROUTES
// ==========================================

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

        res.json({ booking, currentMonth, currentYear, hasPaidCurrentMonth, user: req.session.user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Consolidated PayChangu Payment Route
router.post('/api/resident/pay-rent', requireAuth, requireRole('resident'), async (req, res) => {
    const { amount, roomId, month, year, email, mobile } = req.body;
    const userId = req.session.user.user_id;
    const txRef = `RENT-${userId}-${roomId}-${month}${year}-${Date.now()}`;

    try {
        await db.query(`
            INSERT INTO payments (user_id, room_id, amount, payment_month, payment_year, tx_ref, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `, [userId, roomId, amount, month, year, txRef]);

        const payload = {
            amount: parseFloat(amount),
            currency: "MWK",
            email: email ? email.trim() : req.session.user.email,
            first_name: req.session.user.name.split(' ')[0] || 'Resident',
            last_name: req.session.user.name.split(' ')[1] || 'Student',
            mobile: mobile ? mobile.trim() : req.session.user.phone,
            callback_url: `${process.env.APP_URL || process.env.BASE_URL || 'http://localhost:5000'}/api/webhook`,
            return_url: `${process.env.APP_URL || process.env.BASE_URL || 'http://localhost:5000'}/resident/dashboard`,
            tx_ref: txRef,
            customization: {
                title: "Hostel Rent Payment",
                description: `Rent payment for Month ${month}/${year}`
            }
        };

        const response = await axios.post('https://api.paychangu.com/payment', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        const checkoutUrl = response.data?.data?.checkout_url || response.data?.checkout_url;
        if (response.data && (response.data.status === 'success' || checkoutUrl)) {
            return res.json({ success: true, txRef, checkoutUrl });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: response.data.message || 'Payment initialization failed.' 
            });
        }
    } catch (err) {
        console.error('PayChangu Error:', err.response ? err.response.data : err.message);
        return res.status(500).json({ 
            success: false, 
            message: err.response?.data?.message || 'Internal server error during payment initialization.' 
        });
    }
});

// PayChangu Webhook Listener
router.post('/api/webhook', async (req, res) => {
    try {
        const { tx_ref, status } = req.body;
        const paymentStatus = (status === 'success' || status === 'successful') ? 'successful' : 'failed';

        if (tx_ref) {
            await db.query(
                `UPDATE payments SET status = $1 WHERE tx_ref = $2`,
                [paymentStatus, tx_ref]
            );
        }
        return res.sendStatus(200);
    } catch (err) {
        console.error('Webhook Error:', err);
        return res.status(500).send('Webhook Processing Error');
    }
});

// ==========================================
// LANDLORD API ROUTES
// ==========================================

router.get('/api/landlord/residents-report', requireAuth, requireRole('landlord'), async (req, res) => {
    try {
        const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const query = `
            SELECT 
                u.user_id,
                u.name AS resident_name,
                u.email AS resident_email,
                u.phone AS resident_phone,
                u.program_of_study,
                u.semester,
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