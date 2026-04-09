'use strict';

function timeWaitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { timeWaitFor };
