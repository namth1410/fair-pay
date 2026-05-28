// @ts-nocheck
// Use createRequire to avoid ESM loader issues on Windows + Node 22
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(__filename);

const { getDefaultConfig } = req('expo/metro-config');
const { withUniwindConfig } = req('uniwind/metro');

const config = getDefaultConfig(__dirname);

const finalConfig = withUniwindConfig(config, {
  cssEntryFile: './global.css',
});

// Stub expo-symbols — app không dùng NativeTabs nên không cần Material Symbols
// fonts (7 × 955 KB = 6.4 MB). Xem src/stubs/expo-symbols.js.
const expoSymbolsStub = path.resolve(__dirname, 'src/stubs/expo-symbols.js');
const previousResolveRequest = finalConfig.resolver?.resolveRequest;

finalConfig.resolver = {
  ...finalConfig.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === 'expo-symbols') {
      return { type: 'sourceFile', filePath: expoSymbolsStub };
    }
    if (previousResolveRequest) {
      return previousResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = finalConfig;
