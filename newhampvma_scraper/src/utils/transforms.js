'use strict';

function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const val     = obj[key];
    const newKey  = prefix ? `${prefix}_${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(acc, flattenObject(val, newKey));
    } else if (Array.isArray(val)) {
      acc[newKey] = val.join(', ');
    } else {
      acc[newKey] = val;
    }
    return acc;
  }, {});
}

module.exports = { flattenObject };
