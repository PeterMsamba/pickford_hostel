import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './src/routes.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Trust Render Reverse Proxy (CRITICAL for production HTTPS sessions)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// 2. View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// 3. Request Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// 5. Session Middleware (Single Consolidated Instance)
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'pickford_hostel_secret_key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// 6. Application Routes
app.use(routes);

// 7. Fallback 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// 9. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pickford Hostel Server running on port ${PORT}`);
});