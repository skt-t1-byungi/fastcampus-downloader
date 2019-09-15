const phin = require('phin')

module.exports = async id => {
    const { body: json } = await phin({ url: `https://fast.wistia.com/embed/medias/${id}.json`, parse: 'json' })
    const video = ((json.media && json.media.assets) || [])
        .filter(asset => asset.ext === 'mp4')
        .sort((a, b) => b.size - a.size)[0]

    if (!video) throw new Error(`The video (mediaId: ${id}) does not exist.`)

    return { id, video, name: json.name }
}