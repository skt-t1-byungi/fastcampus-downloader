const puppeteer = require('puppeteer-core')
const findChrome = require('chrome-finder')
const isEmail = require('util-is-email').default
const phin = require('phin')
const createCustomError = require('./createCustomError')
const { URL } = require('url')
const cheerio = require('cheerio')

module.exports = class Client {
    static async attemptLogin ({ email, password }) {
        if (!isEmail(email)) throw createCustomError.type(`Invalid email("${email}") format.`)

        const browser = await puppeteer.launch({ executablePath: findChrome() })
        try {
            const page = await browser.newPage()

            await page.goto('https://online.fastcampus.co.kr/sign_in')
            await page.type('#user_email', email)
            await page.type('#user_password', password)
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
                page.click('[type="submit"]')
            ])

            const http = createHttp(await page.cookies() || [])
            if (!(await http('/', true)).includes('logged_in')) throw createCustomError('Login failed.')

            return new Client(http)
        } finally {
            browser.close()
        }
    }

    constructor (http) {
        this._http = http
    }

    async getCourseIds () {
        const $ = await this._http('/')
        return $('[data-course-ids]').data('course-ids')
    }

    async getCourseById (courseId) {
        const $ = await this._http(`/courses/enrolled/${courseId}`)
        const title = $('.course-sidebar h2').text().trim()
        if (!title) throw createCustomError.type(`Not found course. (${courseId})`)
        return {
            title,
            lectureLinks: $('[data-lecture-id]')
                .map((_, el) => `/courses/${courseId}/lectures/${$(el).data('lecture-id')}`)
                .get()
        }
    }

    async getLectureByLink (link) {
        const $ = await this._http(link)
        const title = $('#lecture_heading').text().trim()
        if (!title) throw createCustomError.type(`Not found lecture. (${link})`)
        return {
            title,
            files: $('.attachment > .download')
                .map((_, el) => ({
                    url: (el = $(el)).attr('href'),
                    name: el.data('x-origin-download-name')
                }))
                .get(),
            mediaIds: $('[data-wistia-id]')
                .map((_, el) => $(el).data('wistia-id'))
                .get()
        }
    }

    async getMediaInfo (mediaId) {
        const { body: json } = await phin({ url: `https://fast.wistia.com/embed/medias/${mediaId}.json`, parse: 'json' })
        const video = ((json.media && json.media.assets) || [])
            .filter(asset => asset.ext === 'mp4')
            .sort((a, b) => b.size - a.size)[0]

        if (!video) throw createCustomError(`The video (mediaId: ${mediaId}) does not exist.`)

        return { id: mediaId, video, name: json.media.name }
    }
}

function createHttp (cookies) {
    const cookie = cookies.map(({ name, value }) => name + '=' + value).join('; ')
    return async (path, raw = false) => {
        const body = (await phin({
            url: new URL(path, 'https://online.fastcampus.co.kr').toString(),
            headers: { cookie }
        })).body.toString()
        return raw ? body : cheerio.load(body)
    }
}
