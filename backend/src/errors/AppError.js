class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = Number(statusCode) || 500;
    this.code = String(code || 'INTERNAL_ERROR');
  }
}

module.exports = { AppError };
