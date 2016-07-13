const mozjpeg = require('mozjpeg');
const execa = require('execa');

const constants = require("./consts");

module.exports = (output) => ({filename}) => {
    console.log(output)
    return execa(mozjpeg, ['-outfile', output, '-quality', constants.JPEG_QUALITY, filename]);
}