const constants = require("./consts");

const urlMatcher = /([\w\d]{24})_(\d{2,4})x(\d{2,4})(\w?).jpg/

module.exports = {
    getProcessFile: processName => `${constants.TEMP_DIR}/${processName}`,
    getFileName: params => `${params.id}_${params.width}x${params.height}${params.operation}.jpg`,
    getFilePath: fileName => `${constants.FILE_DIR}/${fileName}`,
    parseUrl: url => {
        let matches = url.match(urlMatcher);
        if(matches == null || matches.length < 4) return null;

        let operation = matches[4] ? matches[4] : "s"; 
        return {
            id: matches[1],
            width: parseInt(matches[2]),
            height: parseInt(matches[3]),
            operation
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