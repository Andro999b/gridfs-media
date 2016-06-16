const cluster = require("cluster");
const http = require("http");
const fs = require("fs");
const pify = require("pify");

const share = require("./share");
const constants = require("./consts");

const numCPUs = require('os').cpus().length;

const pfs = pify(fs)

module.exports = () => {
    //create fiel directory if not exists
    if (!fs.existsSync(constants.FILE_DIR)){
        fs.mkdirSync(constants.FILE_DIR);
    }

    //start workers
    const workers = [];
    for (var i = 0; i < numCPUs; i++) {
        worker = cluster.fork();
        worker.on('exit', (code, signal) => {
            if (signal) {
                console.log(`worker was killed by signal: ${signal}`);
            } else if (code !== 0) {
                console.log(`worker exited with error code: ${code}`);
            }
        });
        workers.push(worker);
    }

    const getWorker = (id) => {
        let index = id.charAt(id.length - 1) % workers.length;
        return workers[index];
    }
    
    //start http server
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
            if(msg.id == imageParams.id &&
                msg.width == imageParams.width &&
                msg.height == imageParams.height &&
                msg.mode == imageParams.mode) {//same as sended
                    worker.removeListener("message", onFileGenerated);//remove listener for prevent posible memory leak
                    if(msg.success)
                        sendFile(filePath);
                    else
                        sendNotFound();
            }
        }

        //request process start here
        const imageParams = share.parseUrl(req.url);
        //send not found
        if (imageParams == null) {
            sendNotFound();
            return;
        }

        const worker = getWorker(imageParams.id);
        const fielName = share.getFileName(imageParams);
        const filePath = share.getFilePath(fielName);
        fs.exists(filePath, exists => {
            if (exists) {
                sendFile(filePath)
            } else {
                worker.on("message", onFileGenerated)
                worker.send(imageParams);
            }
        });
        req.setTimeout(constants.REQUEST_TIMEOUT)
    });
    server.listen(8080)
}