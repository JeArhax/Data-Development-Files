'use strict';

class ScraperError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'ScraperError';
    this.context = context;
  }
}

class ParseError extends Error {
  constructor(message, rawData = null) {
    super(message);
    this.name = 'ParseError';
    this.rawData = rawData;
  }
}

class NetworkError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
  }
}

module.exports = { ScraperError, ParseError, NetworkError };
