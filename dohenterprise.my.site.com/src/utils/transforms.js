module.exports = {
  formatKeyNamesToCamelCase: (obj) => {
    const newObj = {};
    for (const key in obj) {
      const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
      newObj[camelKey] = obj[key];
    }
    return newObj;
  },

  flattenObject: (obj, prefix = '') => {
    return Object.keys(obj).reduce((acc, key) => {
      const pre = prefix.length ? prefix + '.' : '';
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(acc, module.exports.flattenObject(obj[key], pre + key));
      } else {
        acc[pre + key] = obj[key];
      }
      return acc;
    }, {});
  },
};
