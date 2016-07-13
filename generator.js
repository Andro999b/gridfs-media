const cluster = require('cluster');
const fs = require('fs');
const mongodb = require("mongodb");
const pify = require("pify");
const tempfile = require("tempfile")

const share = require("./share");
const constants = require("./consts");
const conver = require("./convert");
const minify = require("./minify");

//down load from gridfs
const download = pify(function (bucket, id, callback) {
    let contentType, size;
    const filename = tempfile();
    const ws = fs.createWriteStream(filename)

    bucket.openDownloadStream(mongodb.ObjectId(id))
        .on("file", meta => {size = meta.length; contentType = meta.contentType})
        .on("error", callback)
        .pipe(ws)

    ws
        .on('finish', () => callback(null, { filename, size, contentType }))
        .on("error", callback)
})

const startGenerationQueue = bucket => {
            const ts = (context, metric) => (arg) => {
                context.ts[metric] = Date.now();
                return arg
            }

            const detectSize = (context) => (arg) => {
                context.fileSize = arg.size;
                return arg;
            }

            //generation task
            const generate = (context, filePath) => {
                let {id, width, height, operation} = context;

                context.ts = {}; //timestamps
                ts(context, "start")();

                return download(bucket, id)
                    .then(detectSize(context))
                    .then(ts(context, "download_end"))
                    .then(conver(width, height, operation))
                    .then(ts(context, "convert_end"))
                    .then(minify(filePath))
                    .then(ts(context, "minify_end"))
            }

            //generation finish
            const generationFinish = (context, success) => {
                return  () => {
                    activeCount--;
                    inprogress.delete(context.fileName);

                    const ts = context.ts;
                    const total = Date.now() - ts.start;
                    const download = ts.download_end - ts.start;
                    const convert = ts.convert_end - ts.download_end;
                    const minify = ts.minify_end - ts.convert_end;
                    const size = Math.ceil(context.fileSize / 1024);

                    let msg =  success ? 
                    `[Generator Worker] Image ${context.fileName} generated in ${total} ms(download ${size}kb: ${download}, convert ${convert}, minify: ${minify})` + 
                    ` Queue size: ${queue.length}. Active processes: ${activeCount}` :
                    `[Generator Worker] Fail to generate image ${context.fileName}`;

                    console.log(msg)

                    context.success = success;
                    process.send(context);
                    
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

                let context = queue.pop();
                let fileName = context.fileName;
                let filePath = share.getFilePath(fileName);
                activeCount++;

                generate(context, filePath)
                    .then(generationFinish(context, true))
                    .catch(err => {
                        generationFinish(context, false)();
                        console.log(err);
                    })
            }

            process.on("message", context => {
                if (inprogress.has(context.fileName))
                    return;//do not add unqueued file

                inprogress.add(context.fileName);

                queue.push(context);
                console.log(`[Generator Worker] Image ${context.fileName} enqueued. Queue size: ${queue.length}. Active processes: ${activeCount}`);
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
