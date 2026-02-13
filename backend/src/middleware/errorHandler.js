const mysqlStatusMap = {
  ER_DUP_ENTRY: 409,
  ER_NO_REFERENCED_ROW_2: 400,
  ER_BAD_NULL_ERROR: 400,
  ER_TRUNCATED_WRONG_VALUE: 400,
  ER_PARSE_ERROR: 400
};

module.exports = (err, req, res, next) => {
  const status = err.status || mysqlStatusMap[err.code] || 500;
  const message = err.message || 'Server error';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({
    success: false,
    message,
    code: err.code || 'SERVER_ERROR',
    requestId: req.id
  });
};
