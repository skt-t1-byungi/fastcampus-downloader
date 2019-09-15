const ytdlRun = require('ytdl-run')
const fs = require('fs')

module.exports = (url, dest) => {
    return new Promise((resolve, reject) => {
        ytdlRun.stream(url).stdout
            .pipe(fs.createWriteStream(dest))
            .on('finish', resolve)
            .on('error', reject)
    })
}
