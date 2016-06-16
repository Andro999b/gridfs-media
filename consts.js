module.exports = {
    FILE_DIR: './files',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://172.16.2.2:27017/lardi_files',
    CACHE_CONTROL: `max-age=${7 * 24 * 3600}, public`,
    JPEG_QUALITY:  90,
    REQUEST_TIMEOUT: 6000
}