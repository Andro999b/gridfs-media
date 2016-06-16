const constants = require("./consts");

const urlMatcher = /([\w\d]{24})_(\d{2,4})x(\d{2,4})(\w?).jpg/

module.exports = {
    getFileName: params => `${params.id}_${params.width}x${params.height}${params.mode}.jpg`,
    getFilePath: fileName => `${constants.FILE_DIR}/${fileName}`,
    parseUrl: url => {
        let matches = url.match(urlMatcher);
        if(matches == null || matches.length < 4) return null;

        let mode = matches[4] ? matches[4] : "s"; 
        return {
            id: matches[1],
            width: parseInt(matches[2]),
            height: parseInt(matches[3]),
            mode
        }
    },
    isAcceptebleSize: params => {
        for (let size of constants.ACCEPTEBLE_SIZES) {
            if(size.width == params.width && 
               size.height == params.height)
                return true;
        }
        return false;
    }
}