function validate(validator) {
    return function validateMiddleware(req, res, next) {
        const errors = validator(req) || [];
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors });
        }
        next();
    };
}

function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v));
    return false;
}

function toNumber(v) {
    return typeof v === 'number' ? v : Number(v);
}

function isIsoDateYYYYMMDD(v) {
    if (typeof v !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(d.getTime());
}

module.exports = {
    validate,
    isNonEmptyString,
    isFiniteNumber,
    toNumber,
    isIsoDateYYYYMMDD
};

