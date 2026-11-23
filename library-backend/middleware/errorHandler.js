function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('[server error]', err);
    return res.status(500).json({
      error: 'Something went wrong on the server. Please try again.',
      status: 500,
    });
  }

  return res.status(status).json({
    error: err.message || 'Request failed',
    status,
  });
}

module.exports = errorHandler;