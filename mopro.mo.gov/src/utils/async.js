module.exports = {
  wait: (ms) => new Promise(r => setTimeout(r, ms)),
  randomWait: (min = 300, max = 800) =>
    new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min))
};
