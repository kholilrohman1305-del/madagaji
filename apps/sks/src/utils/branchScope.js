function getSessionRole(req) {
    return String(req?.session?.userRole || '');
}

function isSuperAdmin(req) {
    return getSessionRole(req) === 'super_admin';
}

function isBranchAdmin(req) {
    return getSessionRole(req) === 'admin';
}

function getSessionBranchId(req) {
    // Super admin should only be scoped when branch_id is explicitly requested.
    // Ignoring session.branchId avoids accidental filtering to branch 1 (PUSAT).
    if (isSuperAdmin(req)) return null;
    const raw = req?.session?.branchId;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveBranchId(req, candidates = []) {
    if (!isSuperAdmin(req)) return getSessionBranchId(req);

    for (const key of candidates) {
        const val = req?.body?.[key] ?? req?.query?.[key] ?? req?.params?.[key];
        const n = Number(val);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function ensureBranchForAdmin(req, res) {
    if (isBranchAdmin(req) && !getSessionBranchId(req)) {
        res.status(403).json({ success: false, message: 'Akun admin belum terikat ke cabang.' });
        return false;
    }
    return true;
}

module.exports = {
    getSessionRole,
    isSuperAdmin,
    isBranchAdmin,
    getSessionBranchId,
    resolveBranchId,
    ensureBranchForAdmin
};
