// ============================================================
// utils/errors.js
// ============================================================

class ScraperError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'ScraperError';
    this.context = context;
  }
}

class PageLoadError extends ScraperError {
  constructor(message, context) {
    super(message, context);
    this.name = 'PageLoadError';
  }
}

class SelectorNotFoundError extends ScraperError {
  constructor(selector, context) {
    super(`Selector not found: ${selector}`, context);
    this.name = 'SelectorNotFoundError';
    this.selector = selector;
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

class SessionExpiredError extends ScraperError {
  constructor(message, context) {
    super(message, context);
    this.name = 'SessionExpiredError';
  }
}

module.exports = {
  ScraperError,
  PageLoadError,
  SelectorNotFoundError,
  ParseError,
  PaginationError,
  SessionExpiredError,
};
