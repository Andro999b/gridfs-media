const cluster = require('cluster');
const fs = require('fs');
const mongodb = require("mongodb");
const pify = require("pify");
const imageminMozjpeg = require('imagemin-mozjpeg');

const share = require("./share");
const constants = require("./consts");
const conver = require("./convert");

//down load from gridfs
const download = pify(function (bucket, id, callback) {
    let contentType, buffer;
    bucket.openDownloadStream(mongodb.ObjectId(id))
        .on("data", chunk => buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk)
        .on("file", meta => contentType = meta.contentType)
        .on("end", () => callback(null, { buffer, contentType }))
        .on("error", callback)
})

const minify = imageminMozjpeg({ quality: constants.JPEG_QUALITY });

const startGenerationQueue = bucket => {
            //generation task
            const generate = (params, filePath) => {
                let {id, width, height, operation} = params;

                return download(bucket, id)
                    .then(conver(width, height, operation))
                    .then(minify)
                    .then(buf => pify(fs.writeFile)(filePath, buf))
            }

            //generation finish
            const generationFinish = (params, fileName, success) => {
                let msg =  success ? 
                    `[Generator Worker] Image ${fileName} generated` :
                    `[Generator Worker] Fail to generate image ${fileName}`;

                return  () => {
                    console.log(msg)
                    inprogress.delete(fileName);
                    params.success = success;
                    process.send(params);
                    activeCount--;
                    next();
                }
            }

            let inprogress = new Set();//current in progress tasks
            let activeCount = 0;//semaphor
            let queue = [];//queue of generation tasks

            const next = () => {
                if (activeCount >= constants.PARALLEL_GENERATION_COUNT ||
                    !queue.length)
                    return;

                let params = queue.pop();
                let fileName = params.fileName;
                let filePath = share.getFilePath(fileName);

                activeCount++;
                generate(params, filePath)
                    .then(generationFinish(params, fileName, true))
                    .catch(err => {
                        generationFinish(params, fileName, false)();
                        console.log(err);
                    })
            }

            process.on("message", params => {
                if (inprogress.has(params.fileName))
                    return;//do not add unqueued file

                inprogress.add(params.fileName);

                queue.push(params);
                next();
            });
        }

module.exports = () => {
    pify(mongodb.MongoClient)
        .connect(constants.MONGO_URI)
        .then(db => new mongodb.GridFSBucket(db, { bucketName: constants.BACKET_NAME }))
        .then(startGenerationQueue)
        .then(() => console.log('Generator Worker started'))
        .catch(err => console.log('Fail to start worker', err))
}
