import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './src/routes.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// 2. Request Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Static Assets (CSS, JS, Images in public folder)
app.use(express.static(path.join(__dirname, 'public')));

// 4. Session Middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'pickford_hostel_secret_key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// 5. Application Routes (Mount API and Page View Routes)
app.use(routes);

// 6. Fallback 404 Handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// 7. Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// 8. Start Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Pickford Hostel Server running on http://localhost:${PORT}`);
});