const cluster = require("cluster");
const http = require("http");
const fs = require("fs");
const pify = require("pify");

const share = require("./share");
const constants = require("./consts");

const pfs = pify(fs);

module.exports = () => {
    //create file directory if not exists
    if (!fs.existsSync(constants.FILE_DIR)){
        fs.mkdirSync(constants.FILE_DIR);
    }

    if (!fs.existsSync(constants.TEMP_DIR)){
        fs.mkdirSync(constants.TEMP_DIR);
    }

    //start workers
    let generator;
    const spawnGenerator = () => {
        generator = cluster.fork();
        generator.setMaxListeners(100);
        generator.on('error', err => console.log('Generator Fail: ', err))
        generator.on('exit', (worker, code, signal) => {
            console.log('Generator died :(. Okay lets spawn new')
            spawnGenerator();
        })
    }
    spawnGenerator();
    
    
    //start http server
    const server = http.createServer(function (req, res) {
        //request process start here
        let generationTimeout = 0;
        const imageParams = share.parseUrl(req.url);

        const sendFile = (filePath) => {
            cleanup();
            pfs.stat(filePath)
                .then(stat => {//prepare headers and read file(if it need)
                    let lastModified = stat.mtime.toUTCString();
                    let modifiedSince = req.headers["if-modified-since"];
                    //send 304 
                    if(modifiedSince != null && 
                       new Date(modifiedSince).getTime() >= new Date(lastModified).getTime()) {
                        res.writeHead(304, {
                            'Last-Modified': lastModified
                        });
                        return null;
                    }

                    //send 200
                    res.writeHead(200, {
                        'Accept-Ranges': 'bytes',
                        'Content-Type': 'image/jpeg;charset=UTF-8',
                        'Content-Length': stat.size,
                        'Cache-Control' : constants.CACHE_CONTROL,
                        'Last-Modified': lastModified
                    });
                    return pfs.readFile(filePath);
                })
                .then(buf => {//send response
                    res.write(buf);
                    res.end('ok')
                })
                .catch(console.log)
        }

        const sendNotAvailable = () => {
            cleanup();
            console.log(`[Http Server] Image ${imageParams.fileName} unavailable(wait for generation finish)`)
            res.writeHead(503, {
                'Retry-After': new Date(Date.now() + constants.RETRY_AFTER).toUTCString(),
            })

            res.end();
        }

        const sendNotFound = () => {
            cleanup();
            res.statusCode = 404;
            res.end();
        }

        const onFileGenerated = (msg) => {
            if(msg.fileName == imageParams.fileName) {//same as sended
                    if(msg.success)
                        sendFile(filePath);
                    else
                        sendNotFound();
            }
        }

        const cleanup = () => {
            clearTimeout(generationTimeout);
            generator.removeListener('message', onFileGenerated);//remove listener for prevent posible memory leak
        }

        //send not found
        if (imageParams == null || !share.isAcceptebleSize(imageParams)) {
            sendNotFound();
            return;
        }

        //generate file name
        imageParams.fileName = share.getFileName(imageParams);

        const filePath = share.getFilePath(imageParams.fileName);

        fs.exists(filePath, exists => {
            if (exists) {
                sendFile(filePath)
            } else {
                generationTimeout = setTimeout(sendNotAvailable, constants.REQUEST_TIMEOUT)
                generator.on("message", onFileGenerated)
                generator.send(imageParams);
            }
        });
        //if request timed out stop wait generation finish
        req.setTimeout(30000, cleanup)
    });
    server.listen(constants.SERVER_PORT)
    server.on('connect', (req, socket, head) => socket.setKeepAlive(true))
    //errors
    server.on('error', console.log)
}