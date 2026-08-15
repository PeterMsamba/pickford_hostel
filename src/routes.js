import express from 'express';
import { processRegistration, processLogin, processLogout } from './controllers/auth.js';
import { requireLogin, requireRole } from './middleware/auth.js';

const router = express.Router();

// Auth Routes
router.post('/register', processRegistration);
router.post('/login', processLogin);
router.get('/logout', processLogout);

// Landlord Protected Routes
router.get('/landlord/dashboard', requireRole('landlord'), showLandlordDashboard);

// Resident Protected Routes
router.get('/resident/dashboard', requireRole('resident'), showResidentDashboard);

export default router;