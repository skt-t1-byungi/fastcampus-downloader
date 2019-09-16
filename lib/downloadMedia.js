const ytdlRun = require('ytdl-run')

module.exports = (url, dest) => {
    return ytdlRun(['-o', dest, url])
}
