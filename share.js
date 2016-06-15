const constants = require("./consts");

const urlMatcher = /([\w\d]{24})_(\d{2,4})x(\d{2,4}).jpg/

module.exports = {
    getFileName: data => `${data.id}_${data.width}x${data.height}.jpg`,
    getFilePath: fileName => `${constants.FILE_DIR}/${fileName}`,
    parseUrl: url => {
        let matches = url.match(urlMatcher);
        if(matches == null || matches.length < 4) return null;

        return {
            id: matches[1],
            width: parseInt(matches[2]),
            height: parseInt(matches[3])
        }
    }
}