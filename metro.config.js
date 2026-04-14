// @ts-nocheck
// Use createRequire to avoid ESM loader issues on Windows + Node 22
const { createRequire } = require('node:module');
const req = createRequire(__filename);

const { getDefaultConfig } = req('expo/metro-config');
const { withUniwindConfig } = req('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
});
