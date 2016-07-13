const cluster = require("cluster");
const generator = require("./generator");
const master = require("./master");

if(cluster.isMaster){
    master();
}else {
    generator();
}
