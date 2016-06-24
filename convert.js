const gm = require('gm');
const pify = require("pify");

module.exports = (width, height, operation) => {
    //remove aplha channel
    const removeAplha = image => image.background("white").flatten();

    //crop
    const crop = image => new Promise((resolve) => {
        image.size((err, size) => {
            if(err) throw err;

            let iw = size.width, ih = size.height;
            let scale = Math.max(width / iw, height / ih)
            
            image.scale(iw * scale, ih * scale).crop(width, height)

            resolve(image)
        })
    })

    //make nice image 
    const makeNice = image => new Promise((resolve) => {
        image.size((err, size) => {
            if(err) throw err;

            let iw = size.width, ih = size.height;
            if(iw < ih) { //vetical
                image.resize(width, height).quality(100);
            } else { // horizontal
                let scale = height / ih;
                image.scale(iw * scale, ih * scale)
                    .gravity("Center")
                    .crop(width, height)
            }

            resolve(image)
        })
    })
    

    //recate thumbnail(fast)
    const thumb = (image) => image.thumbnail(width, height).quality(100);

    return pify((data, callback) => {
        let type = null;
        let {buffer, contentType} = data;

        switch (contentType) {
            case "image/jpeg": type = "jpg"; break;
            case "image/png": type = "png"; break;
            case "image/gif": type = "gif"; break;
        }

        Promise.resolve(gm(buffer, `image.${type}`))
            .then(removeAplha)
            .then(image => {
                switch (operation) {
                    case "n": return makeNice(image);
                    case "c": return crop(image);
                    case "s"://scale
                    default: return thumb(image);
                }
            })
            .then(image => 
                image.noProfile().toBuffer("JPEG", callback)
            )
            .catch(callback);
    })
}
