const cluster = require("cluster");
const http = require("http");
const fs = require("fs");
const pify = require("pify");

const share = require("./share");
const constants = require("./consts");

const numCPUs = require('os').cpus().length;

const pfs = pify(fs);

module.exports = () => {
    //create file directory if not exists
    if (!fs.existsSync(constants.FILE_DIR)){
        fs.mkdirSync(constants.FILE_DIR);
    }

    //start workers
    const generator = cluster.fork();
    generator.on('error', err => console.log('Generator Fail: ', err))
    
    //start http server
    const server = http.createServer(function (req, res) {
        const sendFile = (filePath) => {
            pfs.stat(filePath)
                .then(stat => {//prepare headers and read file(if it need)
                    let lastModified = stat.mtime.toUTCString();
                    let headers = {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': stat.size,
                        'Cache-Control' : constants.CACHE_CONTROL,
                        'Last-Modified': lastModified
                    };

                    let modifiedSince = req.headers["if-modified-since"];
                    //send 304 
                    if(modifiedSince != null && 
                       new Date(modifiedSince).getTime() >= new Date(lastModified).getTime()) {
                        res.writeHead(304, headers);
                        return null;
                    }

                    //send 200
                    res.writeHead(200, headers);
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
        req.setTimeout(constants.REQUEST_TIMEOUT)
    });
    server.listen(8080)
    //errors
    server.on('error', console.log)
}