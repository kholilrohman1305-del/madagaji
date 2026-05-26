function createRateLimiter(options) {
    const windowMs = options.windowMs;
    const max = options.max;
    const keyGenerator = options.keyGenerator || ((req) => req.ip || 'unknown');
    const message = options.message || 'Too many requests';

    // key -> { count, resetAt }
    const buckets = new Map();

    return function rateLimiter(req, res, next) {
        const now = Date.now();
        const key = keyGenerator(req);
        const existing = buckets.get(key);

        if (!existing || existing.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        existing.count += 1;
        if (existing.count > max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({ success: false, message });
        }

        return next();
    };
}

module.exports = { createRateLimiter };

