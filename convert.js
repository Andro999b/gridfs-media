const gm = require('gm');
const pify = require("pify");

const constants = require("./consts");

module.exports = (width, height, operation) => {
    //auto rotate by EXIF
    const rotate = image => image.autoOrient()

    //remove aplha channel
    const removeAplha = image => image.background("white").flatten();

    //crop
    const crop = image => new Promise((resolve) => {
        image.size((err, size) => {
            if(err) throw err;

            let iw = size.width, ih = size.height;
            let scale = Math.max(width / iw, height / ih)
            
            image.scale(iw * scale, ih * scale)
                .gravity("Center")
                .crop(width, height)

            resolve(image)
        })
    })

    //make nice image 
    const makeNice = image => new Promise((resolve) => {
        image.size((err, size) => {
            if(err) throw err;
            
            let iw = size.width, ih = size.height;
            if(iw < ih) { //vetical
                image.resize(width, height);
            } else { // horizontal
                let scale = height / ih;
                image.scale(iw * scale, ih * scale)
                    .gravity("Center")
                    .crop(width, height)
            }

            resolve(image)
        })
    })
    
    //crecate thumbnail(fast)
    const thumb = image => image.thumbnail(width, height);

    return pify((data, callback) => {
        let type = null;
        let {buffer, contentType} = data;

        switch (contentType) {
            case "image/jpeg": type = "jpg"; break;
            case "image/png": type = "png"; break;
            case "image/gif": type = "gif"; break;
        }

        Promise.resolve(gm(buffer, `image.${type}`))
            .then(rotate)
            .then(removeAplha)
            .then(image => {
                switch (operation) {
                    case "n": return makeNice(image);
                    case "c": return crop(image);
                    case "s"://scale
                    default: return thumb(image);
                }
            })
            .then(image => {
                let stream = image
                    .noProfile()
                    .stream("JPEG")
                
                let buffer = new streamBuffers.ReadableStreamBuffer()
                stream.on("data", chunk => buffer.put(chunk))
                stream.on("end", () => buffer.stop())

                console.log(Buffer.isBuffer(buffer))

                callback(null, buffer)
            })
            .catch(callback);
    })
}
