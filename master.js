const cluster = require("cluster");
const fs = require("fs");
const constants = require("./consts");

const newGenerator = require("./generator");

const numCPUs = require('os').cpus().length;

module.exports = () => {
    //create file directory if not exists
    if (!fs.existsSync(constants.FILE_DIR)) {
        fs.mkdirSync(constants.FILE_DIR);
    }

    if (!fs.existsSync(constants.TEMP_DIR)) {
        fs.mkdirSync(constants.TEMP_DIR);
    }

    let generator = newGenerator();

    generator.on("finish", params => {
        cluster.workers[params.worker_id].send(params);
    })

    function listenWorker(worker) {
        worker.on("message", params => {
            generator.emit("generate", Object.assign({worker_id: worker.id}, params))
        });
    }

    for (let i = 0; i < numCPUs; i++) {
        listenWorker(cluster.fork());
    }

}