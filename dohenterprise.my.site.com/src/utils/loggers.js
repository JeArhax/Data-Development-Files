module.exports = {
  log: (message) => {
    console.log(`${new Date().toISOString()} ${message}`);
  },

  error: (message) => {
    console.error(`${new Date().toISOString()} ❌ ${message}`);
  },

  success: (message) => {
    console.log(`${new Date().toISOString()} ✅ ${message}`);
  },

  warn: (message) => {
    console.warn(`${new Date().toISOString()} ⚠️ ${message}`);
  },
};
