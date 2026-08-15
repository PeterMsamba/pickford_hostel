import bcrypt from 'bcrypt';
import db from '../models/db.js';

/**
 * Handle Registration (Collects Name, Email, Phone, Password, and Role)
 */
export async function processRegistration(req, res, next) {
    const { name, email, phone, password, role } = req.body; // role: 'landlord' or 'resident'

    try {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const query = `
            INSERT INTO users (name, email, phone, password_hash, role_id)
            VALUES ($1, $2, $3, $4, (SELECT role_id FROM roles WHERE role_name = $5))
            RETURNING user_id;
        `;
        await db.query(query, [name, email, phone, passwordHash, role || 'resident']);

        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    } catch (error) {
        next(error);
    }
}

/**
 * Handle Login Submission & Role-Based Redirection
 */
export async function processLogin(req, res, next) {
    const { email, password } = req.body;

    try {
        // 1. Fetch user and their role
        const query = `
            SELECT u.user_id, u.name, u.email, u.phone, u.password_hash, r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.email = $1;
        `;
        const result = await db.query(query, [email]);
        const user = result.rows[0];

        if (!user) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        // 2. Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        // 3. Regenerate session ID to prevent session fixation
        req.session.regenerate((err) => {
            if (err) return next(err);

            delete user.password_hash;
            req.session.user = user;

            req.flash('success', `Welcome back, ${user.name}!`);

            // 4. Redirect based on role
            if (user.role_name === 'landlord') {
                res.redirect('/landlord/dashboard');
            } else {
                res.redirect('/resident/dashboard');
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Handle Logout
 */
export function processLogout(req, res) {
    req.session.destroy(() => {
        res.redirect('/login');
    });
}