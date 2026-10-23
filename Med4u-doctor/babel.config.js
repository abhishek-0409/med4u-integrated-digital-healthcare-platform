const expoBabelPreset = require.resolve("babel-preset-expo", {
  paths: [require.resolve("expo/package.json")],
});

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [[expoBabelPreset, { web: { unstable_transformImportMeta: true } }]],
  };
};
