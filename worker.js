const cluster = require('cluster');
const fs = require('fs');
const lwip = require('lwip');
const mongodb = require("mongodb");
const pify = require("pify");
const imageminJpegtran = require('imagemin-jpegtran');

const share = require("./share");
const constants = require("./consts");

const pfs = pify(fs);
const plwip = pify(lwip);
const pmongodb = pify(mongodb.MongoClient);

const resize = (width, height) => {
    return pify(function(data, callback) {
        let type = null;
        let {fileBuffer, contentType} = data;

        switch(contentType){
            case "image/jpeg": type = "jpg"; break;
            case "image/png": type = "png"; break;
            case "image/gif": type = "gif"; break;
        }

        plwip.open(fileBuffer, type)
            .then((image) => {
                image.batch()
                    .cover(width, height)
                    .toBuffer("jpg", callback);
            })
            .catch(callback)
    });
};

const download = pify(function (bucket, id, callback) {
    let contentType, fileBuffer;
    bucket.openDownloadStream(mongodb.ObjectId(id))
            .on("data", buf => fileBuffer = buf)
            .on("file", meta => contentType = meta.contentType)
            .on("end", () => callback(null, {fileBuffer, contentType}))
            .on("error", callback)
})

const minify = imageminJpegtran();

module.exports = () => {
    pmongodb.connect(constants.MONGO_URI)
        .then(db => new mongodb.GridFSBucket(db, {bucketName: "marketgoods"}))
        .then(bucket => {
            if (!fs.existsSync(constants.FILE_DIR)){
                fs.mkdirSync(constants.FILE_DIR);
            }

            const generate = (id, width, height, filePath) => (
                download(bucket, id)
                    .then(resize(width, height))
                    .then(minify)
                    .then(buf => pfs.writeFile(filePath, buf))
            )

            let inprogress = new Set();

            process.on("message", msg => {
                console.log(msg)

                let {id, width, height} = msg;
                let fileName = share.getFileName(msg);
                let filePath = share.getFilePath(fileName);

                if(inprogress.has(fileName)) return;
                inprogress.add(fileName);

                generate(id, width, height, filePath)
                    .then(() => {
                        inprogress.delete(fileName);
                        console.log(`Image ${fileName} generated`);
                        process.send(msg);
                    })
                    .catch(err => {
                        inprogress.delete(fileName)
                        console.log(`Fail to generate image ${fileName}`, err)
                        process.send({err, msg});
                    })

            });
        })
        .then(() => console.log(`Worker #${cluster.worker.id} started`))
        .catch(err => console.log("Fail to start worker", err))
}
