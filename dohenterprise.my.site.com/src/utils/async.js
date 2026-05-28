module.exports = {
  wait: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  randomWait: (min = 1000, max = 2000) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
