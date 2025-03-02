const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = function override(config, env) {
  // 添加插件来复制文件
  if (!config.plugins) {
    config.plugins = [];
  }

  config.plugins.push(
    new CopyWebpackPlugin({
      patterns: [
        { 
          from: 'public/manifest.json',
          to: 'manifest.json'
        },
        { 
          from: 'public/images',
          to: 'images'
        },
        { 
          from: 'public/sounds',
          to: 'sounds'
        }
      ]
    })
  );

  return config;
} 