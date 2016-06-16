const cluster = require('cluster');
const fs = require('fs');
const gm = require('gm');
const mongodb = require("mongodb");
const pify = require("pify");
const imageminMozjpeg = require('imagemin-mozjpeg');

const share = require("./share");
const constants = require("./consts");

const pfs = pify(fs);
const pmongodb = pify(mongodb.MongoClient);

const resize = (width, height, mode) => {
    return pify((data, callback) => {
        let type = null;
        let {buffer, contentType} = data;

        switch (contentType) {
            case "image/jpeg": type = "jpg"; break;
            case "image/png": type = "png"; break;
            case "image/gif": type = "gif"; break;
        }


        let image = gm(buffer, `image.${type}`);
        image.size((err, size) => {
            if(err) { callback(err); return; }

            let iw = size.width, ih = size.height;
            switch (mode) {
                case "c": {//crop
                    let vertical = iw < ih; 
                    let scale = iw < ih ? width/iw : height/ih;
                    image.scale(iw * scale,  ih * scale);
                    if(!vertical) image.gravity("Center")
                    image.crop(width, height);
                    break;
                }
                case "s"://scale
                default: {
                    image.resize(width, height)
                }
            }

            image.quality(100).toBuffer("JPEG", callback);
        })
    })
}

const download = pify(function (bucket, id, callback) {
    let contentType, buffer;
    bucket.openDownloadStream(mongodb.ObjectId(id))
        .on("data", chunk => buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk)
        .on("file", meta => contentType = meta.contentType)
        .on("end", () => callback(null, { buffer, contentType }))
        .on("error", callback)
})

const minify = imageminMozjpeg({ quality: constants.JPEG_QUALITY });

module.exports = () => {
    pmongodb.connect(constants.MONGO_URI)
        .then(db => new mongodb.GridFSBucket(db, { bucketName: constants.BACKET_NAME }))
        .then(bucket => {
            const generate = (params, filePath) => {
                let {id, width, height, mode} = params;

                return download(bucket, id)
                    .then(resize(width, height, mode))
                    .then(minify)
                    .then(buf => pfs.writeFile(filePath, buf))
            }

            let inprogress = new Set();

            process.on("message", params => {
                let fileName = params.fileName;
                let filePath = share.getFilePath(fileName);

                if (inprogress.has(fileName)) return;
                inprogress.add(fileName);

                generate(params, filePath)
                    .then(() => {
                        inprogress.delete(fileName);
                        console.log(`[Generator Worker] Image ${fileName} generated`);

                        params.success = true;
                        process.send(params);
                    })
                    .catch(err => {
                        inprogress.delete(fileName)
                        console.log(`[Generator Worker] Fail to generate image ${fileName}`, err)

                        params.success = false;
                        process.send(params);
                    })

            });
        })
        .then(() => console.log('Generator Worker started'))
        .catch(err => console.log('Fail to start worker', err))
}
