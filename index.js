const cluster = require("cluster");
const worker = require("./worker");
const master = require("./master");

if(cluster.isMaster){
    master();
}else {
    worker();
}
