function requestLogger(req, res, next) {
    // Keep it simple: method + url + status + duration.
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`[request] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
}

module.exports = { requestLogger };

