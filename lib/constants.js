const { homedir } = require('os');
const { resolve } = require('path');

const APP_DIR = resolve(homedir(), '.certbaker');

module.exports = {
  APP_DIR,
  SUB_DEFAULT: {
    country: 'CH',
    state: 'BE',
    organization: 'Certbaker'
  }
};
