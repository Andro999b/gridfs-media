const cluster = require("cluster");
const server = require("./server");
const master = require("./master");

if(cluster.isMaster){
    master();
}else {
    server();
}
