module.exports.toCamelCase = (str) =>
  str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
