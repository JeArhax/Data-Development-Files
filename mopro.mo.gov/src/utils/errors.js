module.exports.safe = async (fn, fallback = null) => {
  try {
    return await fn();
  } catch (e) {
    console.error('Error caught:', e.message);
    return fallback;
  }
};
