function requireAdmin(req, res, next) {
    if (req.session && req.session.adminId && (req.session.userRole === 'super_admin' || req.session.userRole === 'admin' || req.session.userRole === 'wali_kelas' || req.session.userRole === 'guru')) {
        if (req.session.userRole === 'admin' && req.session.pinRequired) {
            const verifiedUntil = Number(req.session.pinVerifiedUntil || 0);
            if (!(verifiedUntil > Date.now())) {
                return res.status(423).json({
                    success: false,
                    code: 'PIN_REQUIRED',
                    message: 'Verifikasi PIN diperlukan untuk melanjutkan.'
                });
            }
        }
        return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized (admin only)' });
}

module.exports = { requireAdmin };
