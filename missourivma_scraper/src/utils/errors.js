/**
 * utils/errors.js — Typed scraping errors
 */

class ScraperError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name  = 'ScraperError';
    this.context = context;
  }
}

class NetworkError extends ScraperError {
  constructor(message, context) {
    super(message, context);
    this.name = 'NetworkError';
  }
}

class ParseError extends ScraperError {
  constructor(message, context) {
    super(message, context);
    this.name = 'ParseError';
  }
}

class PaginationError extends ScraperError {
  constructor(message, context) {
    super(message, context);
    this.name = 'PaginationError';
  }
}

module.exports = { ScraperError, NetworkError, ParseError, PaginationError };
