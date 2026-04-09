const { AppError } = require('../errors/AppError');

const errorHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  console.error('[backend] unexpected error:', error);
  return res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    },
  });
};

module.exports = { errorHandler };
