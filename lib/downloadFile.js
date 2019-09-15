const phin = require('phin')
const fs = require('fs')

module.exports = (url, dest) => {
    return new Promise((resolve, reject) => {
        phin({ url, stream: true, followRedirects: true }).then(res => {
            res.stream.pipe(fs.createWriteStream(dest))
                .on('finish', resolve)
                .on('error', reject)
        })
    })
}
