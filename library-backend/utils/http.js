class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Turns a URL value like "3" into a positive integer, or throws a 400 error.
function parseId(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  return n;
}

module.exports = { HttpError, parseId };