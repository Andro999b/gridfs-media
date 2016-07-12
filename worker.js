const cluster = require('cluster');
const fs = require('fs');
const mongodb = require("mongodb");
const pify = require("pify");
const optimazer = require('imagemin-jpegtran');

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

const minify = optimazer({ progressive: true});

const startGenerationQueue = bucket => {
            const ts = (params, metric) => (arg) => {
                params.ts[metric] = Date.now();
                return arg
            }

            const detectSize = (params) => (arg) => {
                params.fileSize = arg.buffer.length;
                return arg;
            }

            //generation task
            const generate = (params, filePath) => {
                let {id, width, height, operation} = params;

                params.ts = {}; //timestamps
                ts(params, "start")();

                return download(bucket, id)
                    .then(detectSize(params))
                    .then(ts(params, "download_end"))
                    .then(conver(width, height, operation))
                    .then(ts(params, "convert_end"))
                    .then(minify)
                    .then(ts(params, "minify_end"))
                    .then(buf => pify(fs.writeFile)(filePath, buf))
                    .then(ts(params, "store_end"))
            }

            //generation finish
            const generationFinish = (params, success) => {
                return  () => {
                    activeCount--;
                    inprogress.delete(params.fileName);

                    const total = Date.now() - params.ts.start;
                    const download = params.ts.download_end - params.ts.start;
                    const convert = params.ts.convert_end - params.ts.download_end;
                    const minify = params.ts.minify_end - params.ts.convert_end;
                    const store = params.ts.store_end - params.ts.minify_end;
                    const size = Math.ceil(params.fileSize / 1024);

                    let msg =  success ? 
                    `[Generator Worker] Image ${params.fileName} generated in ${total} ms(download ${size}kb: ${download}, convert ${convert}, minify: ${minify}, store: ${store})` + 
                    ` Queue size: ${queue.length}. Active processes: ${activeCount}` :
                    `[Generator Worker] Fail to generate image ${params.fileName}`;

                    console.log(msg)

                    params.success = success;
                    process.send(params);
                    
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
                    .then(generationFinish(params, true))
                    .catch(err => {
                        generationFinish(params, false)();
                        console.log(err);
                    })
            }

            process.on("message", params => {
                if (inprogress.has(params.fileName))
                    return;//do not add unqueued file

                inprogress.add(params.fileName);

                queue.push(params);
                console.log(`[Generator Worker] Image ${params.fileName} enqueued. Queue size: ${queue.length}. Active processes: ${activeCount}`);
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
