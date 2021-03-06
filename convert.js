const gm = require('gm').subClass({nativeAutoOrient: true});
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
    
    //create thumbnail(fast)
    const thumb = image => image.thumbnail(width, height);

    return pify(({filename}, callback) => {
        let outFilename = `${filename}-converted.jpg`;

        Promise.resolve(gm(filename))
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
            .then(image => 
                image
                    .noProfile()
                    .write(outFilename, err => {
                        if (err) {
                            callback(err);
                            return;
                        }
                        callback(null, {filename: outFilename})
                    })
            )
            .catch(callback);
    })
}
