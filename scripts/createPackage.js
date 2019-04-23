const packager = require('electron-packager')

const packageFile = require('./../package.json')
const version = packageFile.version
const electronVersion = packageFile.electronVersion

const basedir = require('path').join(__dirname, '../')
const ignoredDirs = ['.DS_Store', 'dist/app', /\.map$/g, /\.md$/g] // directories that will be ignored when building binaries

var baseOptions = {
  name: 'Min',
  dir: basedir,
  out: 'dist/app',
  electronVersion: electronVersion,
  appVersion: version,
  arch: 'all',
  icon: 'icons/icon256.ico',
  ignore: ignoredDirs,
  prune: true,
  overwrite: true
}

var platformOptions = {
  darwin: {
    platform: 'darwin',
    icon: 'icon.icns',
    protocols: [{
      name: 'HTTP link',
      schemes: ['http', 'https']
    }, {
      name: 'File',
      schemes: ['file']
    }]
  },
  win32: {
    platform: 'win32',
    icon: 'icons/icon256.ico'
  },
  linux: {
    platform: 'linux'
  }
}

module.exports = function (platform) {
  return packager(Object.assign({}, baseOptions, platformOptions[platform]))
}
