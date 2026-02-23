const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const metroResolver = require('metro-resolver');

const config = getDefaultConfig(__dirname);

// Fix expo-av: extensionless imports (./Video.types etc.) fail to resolve on Windows.
const expoAvBuild = path.join(__dirname, 'node_modules', 'expo-av', 'build');
const typeModules = ['AV.types', 'Audio.types', 'Video.types'];

const defaultResolve = config.resolver.resolveRequest || metroResolver.resolve;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = (context.originModulePath || '').replace(/\//g, path.sep);
  const fromExpoAv = origin.includes('expo-av') && origin.includes('build') && origin.endsWith('index.js');
  const bare = moduleName.replace(/^\.[/\\]/, '');
  if (fromExpoAv && typeModules.includes(bare)) {
    const filePath = path.join(expoAvBuild, bare + '.js');
    return { type: 'sourceFile', filePath };
  }
  return defaultResolve(context, moduleName, platform);
};

module.exports = config;
