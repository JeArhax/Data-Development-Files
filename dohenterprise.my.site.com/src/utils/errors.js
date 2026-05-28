module.exports = {
  safe: async (fn, defaultValue = null) => {
    try {
      return await fn();
    } catch (err) {
      return defaultValue;
    }
  },

  handleError: (error, context = '') => {
    console.error(`Error ${context}:`, error.message);
    return null;
  },
};
