const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Only exclude the NativeWind type file explicitly, keep all other defaults
config.resolver.blockList = [
  ...config.resolver.blockList,
  /nativewind\.types\.d\.ts/,
];

module.exports = config;