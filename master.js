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
        const sendFile = (filePath) => {
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

        const sendNotFound = () => {
            res.statusCode = 404;
            res.end();
        }

        const onFileGenerated = (msg) => {
            if(msg.fileName == imageParams.fileName) {//same as sended
                    generator.removeListener('message', onFileGenerated);//remove listener for prevent posible memory leak
                    if(msg.success)
                        sendFile(filePath);
                    else
                        sendNotFound();
            }
        }

        //request process start here
        const imageParams = share.parseUrl(req.url);
        
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
                generator.on("message", onFileGenerated)
                generator.send(imageParams);
            }
        });
        //if request timed out stop wait generation finish
        req.setTimeout(constants.REQUEST_TIMEOUT, () => generator.removeListener('message', onFileGenerated))
    });
    server.listen(constants.SERVER_PORT)
    //errors
    server.on('error', console.log)
}