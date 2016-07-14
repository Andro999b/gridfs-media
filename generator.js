const cluster = require('cluster');
const fs = require('fs');
const mongodb = require("mongodb");
const pify = require("pify");
const tempfile = require("tempfile")

const share = require("./share");
const constants = require("./consts");
const conver = require("./convert");
const minify = require("./minify");

const startGenerationQueue = bucket => {
    //down load from gridfs
    const download = pify(function (id, filename, callback) {
        let contentType, size;
        const ws = fs.createWriteStream(filename)

        bucket.openDownloadStream(mongodb.ObjectId(id))
            .on("file", meta => { size = meta.length; contentType = meta.contentType })
            .on("error", callback)
            .pipe(ws)

        ws
            .on('finish', () => callback(null, { filename, size, contentType }))
            .on("error", callback)
    })


    class GeneratorProcess {
        constructor(num) {
            this.processName = `process${num}`
        }

        generate(context, filePath) {
            const filename = share.getProcessFile(this.processName);
            const {id, width, height, operation} = context;

            //timestamps and lise metrics
            context.ts = {}; //timestamps
            const ts = (context, metric) => arg => {
                context.ts[metric] = Date.now();
                return arg
            }

            const detectSize = context => arg => {
                context.fileSize = arg.size;
                return arg;
            }

            const printStats = () => {
                const ts = context.ts;
                const total = Date.now() - ts.start;
                const download = ts.download_end - ts.start;
                const convert = ts.convert_end - ts.download_end;
                const minify = ts.minify_end - ts.convert_end;
                const size = Math.ceil(context.fileSize / 1024);

                console.log(`[${this.processName}] Image ${context.fileName} generated in ${total} ms` +
                    `(download ${size}kb: ${download}, convert ${convert}, minify: ${minify})`)
            }

            ts(context, "start")();

            return download(id, filename)
                .then(detectSize(context))
                .then(ts(context, "download_end"))
                .then(conver(width, height, operation))
                .then(ts(context, "convert_end"))
                .then(minify(filePath))
                .then(ts(context, "minify_end"))
                .then(printStats)
        }
    }

    class ProcessQueue {
        constructor(finishCallback) {
            this.inprogress = new Set(); //current in progress tasks
            this.queue = []; //queue of generation tasks
            this.avaliableProcess = [];
            this.finishCallback = finishCallback;

            for(let i = 1; i <= constants.PARALLEL_GENERATION_COUNT; i++) {
                this.avaliableProcess.push(new GeneratorProcess(i));
            }
        }

        enqueue(params) {
            const context = Object.assign({}, params);
            const inprogress = this.inprogress;
            const avaliableProcess = this.avaliableProcess;
            const queue = this.queue;

            if (inprogress.has(params.fileName))
                return;//do not add unqueued file

            inprogress.add(params.fileName);

            queue.push(context);

            console.log(`[Generators queue] Image ${params.fileName} enqueued. Queue size: ${queue.length}. Avalibale processes: ${avaliableProcess.length}`);
            this.next();
        }

        next() {
            const avaliableProcess = this.avaliableProcess;
            const queue = this.queue;

            if (avaliableProcess.length == 0 || !queue.length)
                return;

            const context = queue.pop();
            const process = avaliableProcess.pop();
            const fileName = context.fileName;
            const filePath = share.getFilePath(fileName);

            const finish = this._generationFinish(context, process);

            process.generate(context, filePath)
                .then(() => finish(true))
                .catch(err => {
                    finish(false);
                    console.log(err);
                })
        }


        _generationFinish(context, process) {
            const queue = this.queue;
            const avaliableProcess = this.avaliableProcess;
            const finishCallback = this.finishCallback;

            return (success) => {
                inprogress.delete(context.fileName);
                avaliableProcess.push(process);

                let msg = success ?
                    `[Generators queue] Queue size: ${queue.length}. Avalibale processes: ${avaliableProcess.length}` :
                    `[Generators queue] Fail to generate image ${context.fileName}`;

                console.log(msg)

                context.success = success;
                finishCallback(context);

                this.next();
            }
        }
    }

    const queue = new ProcessQueue(process.send)
    process.on("message", (params) => queue.enqueue(params));
}

module.exports = () => {
    pify(mongodb.MongoClient)
        .connect(constants.MONGO_URI)
        .then(db => new mongodb.GridFSBucket(db, { bucketName: constants.BACKET_NAME }))
        .then(startGenerationQueue)
        .then(() => console.log('Generator Worker started'))
        .catch(err => console.log('Fail to start worker', err))
}
