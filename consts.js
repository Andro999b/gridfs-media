const numCPUs = require('os').cpus().length;

const accetebleSizesStr = process.env.ACCEPTEBLE_SIZES || "60x40,400x262,1230x750"
const accetebleSizes = accetebleSizesStr.split(",").map(size => {
    let wh = size.split("x")
    if(wh.length > 1){
        return {
            width: parseInt(wh[0]),
            height: parseInt(wh[1])
        }
    }
    return null;
}).filter(val => val !== null)

module.exports = {
    SERVER_PORT: parseInt(process.env.SERVER_PORT) || 8080,
    TEMP_DIR: './temp', 
    FILE_DIR: './files',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://192.168.4.218,192.168.4.219,192.168.4.217/lardi_files?replicaSet=lardi_files', //'mongodb://172.16.2.2:27017/lardi_files'
    BACKET_NAME: process.env.GRIDFS_BACKET || "marketgoods",
    CACHE_CONTROL: `max-age=${7 * 24 * 3600}, public`,
    JPEG_QUALITY:  process.env.JPEG_QUALITY || 90,
    REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT || 6000,
    RETRY_AFTER: process.env.RETRY_AFTER || 6000,
    ACCEPTEBLE_SIZES: accetebleSizes,
    PARALLEL_GENERATION_COUNT: process.env.PARALLEL_GENERATION_COUNT || numCPUs
}