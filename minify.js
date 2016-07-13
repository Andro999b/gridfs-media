const mozjpeg = require('mozjpeg');
const execa = require('execa');

const constants = require("./consts");

module.exports = (output) => ({filename}) =>  execa(mozjpeg, ['-outfile', output, '-quality', constants.JPEG_QUALITY, filename]);
