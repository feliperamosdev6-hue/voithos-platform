const { AppError } = require('../errors/AppError');

const validate = (validator) => (req, _res, next) => {
  try {
    const result = typeof validator === 'function' ? validator(req) : null;
    const issues = Array.isArray(result) ? result.filter(Boolean) : [];

    if (issues.length > 0) {
      const firstIssue = issues[0];
      return next(new AppError(400, 'VALIDATION_ERROR', firstIssue.message || 'Invalid request payload.'));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { validate };
