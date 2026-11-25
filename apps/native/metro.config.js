const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const uniwindConfig = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});

// Uniwind points `react-native` imports at its own re-export, which lacks `AssetRegistry`,
// so expo-asset (and every font load through it) would get `undefined`. It gets the real one.
const uniwindResolveRequest = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native" && /[\\/]expo-asset[\\/]/.test(context.originModulePath)) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return uniwindResolveRequest(context, moduleName, platform);
};

module.exports = withVarlockMetroConfig(uniwindConfig);
