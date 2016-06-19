const cluster = require('cluster');
const fs = require('fs');
const gm = require('gm');
const mongodb = require("mongodb");
const pify = require("pify");
const imageminMozjpeg = require('imagemin-mozjpeg');

const share = require("./share");
const constants = require("./consts");

//conver image
const conver = (width, height, operation) => {
    //remove aplha channel
    const removeAplha = image => image.background("white").flatten();

    //nice crop
    const crop = image => new Promise((resolve) => {
        image.size((err, size) => {
            if(err) throw err;

            let iw = size.width, ih = size.height;
            let scale = Math.max(width / iw, height / ih)
            
            image.scale(iw * scale, ih * scale)
            if(iw > ih) image.gravity("Center");
            image.crop(width, height);

            resolve(image)
        })
    })

    //recate thumbnail(fast)
    const thumb = (image) => image.thumbnail(width, height).quality(100);

    return pify((data, callback) => {
        let type = null;
        let {buffer, contentType} = data;

        switch (contentType) {
            case "image/jpeg": type = "jpg"; break;
            case "image/png": type = "png"; break;
            case "image/gif": type = "gif"; break;
        }

        Promise.resolve(gm(buffer, `image.${type}`))
            .then(removeAplha)
            .then(image => {
                switch (operation) {
                    case "c": return crop(image);
                    case "s"://scale
                    default: return thumb(image);
                }
            })
            .then(image => 
                image.noProfile().toBuffer("JPEG", callback)
            )
            .catch(callback);
    })
}

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
