// Ensure user is logged in
export function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to access this page.');
    res.redirect('/login');
}

// Restrict route to specific role ('landlord' or 'resident')
export function requireRole(roleName) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            req.flash('error', 'You must be logged in.');
            return res.redirect('/login');
        }

        if (req.session.user.role_name !== roleName) {
            req.flash('error', 'Access denied. Unauthorized role.');
            return res.redirect('/login');
        }

        next();
    };
}