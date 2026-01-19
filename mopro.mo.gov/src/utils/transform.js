module.exports = {
  formatKeyNamesToCamelCase: (obj) => {
    const newObj = {};
    for (const key in obj) {
      const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
      newObj[camelKey] = obj[key];
    }
    return newObj;
  }
};
