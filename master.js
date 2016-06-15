const cluster = require("cluster");
const http = require("http");
const fs = require("fs");
const pify = require("pify");

const share = require("./share");
const constants = require("./consts");

const pfs = pify(fs)

module.exports = () => {
    const worker = cluster.fork();
    const server = http.createServer(function (req, res) {
        const sendFile = (filePath) => {
            pfs.stat(filePath)
                .then(stat => {
                    res.writeHead(200, {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': stat.size,
                        'Cache-Control' : constants.CACHE_CONTROL 
                    })
                    return pfs.readFile(filePath);
                })
                .then(buf => {
                    res.write(buf);
                    res.end("ok")
                })
                .catch(console.log)
        }

        const sendNotFound = () => {
            res.statusCode = 404;
            res.end();
        }

        const onFileGenerated = (msg) => {
            if(msg.id == imageData.id &&
                msg.width == imageData.width &&
                msg.height == imageData.height) {//same as sended
                    worker.removeListener("message", onFileGenerated);//remove listener for prevent posible memory leak
                    if(msg.success)
                        sendFile(filePath);
                    else
                        sendNotFound();
            }
        }

        let imageData = share.parseUrl(req.url);
        //send not found
        if (imageData == null) {
            sendNotFound();
            return;
        }

        let fielName = share.getFileName(imageData);
        let filePath = share.getFilePath(fielName);
        fs.exists(filePath, exists => {
            if (exists) {
                sendFile(filePath)
            } else {
                worker.on("message", onFileGenerated)
                worker.send(imageData);
            }
        });
        req.setTimeout(constants.REQUEST_TIMEOUT)
    });
    server.listen(8080)
}