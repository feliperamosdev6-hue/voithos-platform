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

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'Arquivo muito grande.',
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
