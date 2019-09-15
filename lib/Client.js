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

    async getCourseById (id) {
        const $ = await this._http(`/courses/enrolled/${id}`)
        const title = $('.course-sidebar h2').text().trim()
        if (!title) throw createCustomError.type(`Not find course(id: "${id}")`)
        return {
            title,
            lectureLinks: $('[data-lecture-id]')
                .map((_, el) => `/courses/${id}/lectures/${$(el).data('lecture-id')}`)
                .get()
        }
    }

    async getLectureByLink (link) {
        const $ = await this._http(link)
        const title = $('#lecture_heading').text().trim()
        if (!title) throw createCustomError.type(`Not find lecture(link: "${link}")`)
        return {
            title,
            files: $('.download')
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