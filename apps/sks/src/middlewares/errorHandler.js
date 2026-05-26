function errorHandler(err, req, res, next) {
    // eslint-disable-next-line no-unused-vars
    const isProd = process.env.NODE_ENV === 'production';
    let status = err && Number.isInteger(err.status) ? err.status : 500;

    // Common input errors
    if (err && err.name === 'MulterError') status = 400;
    if (err && typeof err.message === 'string' && err.message.toLowerCase().includes('only .xlsx')) status = 400;

    // Avoid leaking internals in production; log full error server-side.
    console.error('[error]', err);

    res.status(status).json({
        success: false,
        message: isProd ? 'Internal server error' : (err && err.message ? err.message : 'Internal server error')
    });
}

module.exports = { errorHandler };
