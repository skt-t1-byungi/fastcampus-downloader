#!/usr/bin/env node
const meow = require('meow')
const prompts = require('prompts')
const isEmail = require('util-is-email').default
const { Client, downloadFile, downloadMedia } = require('.')
const ora = require('ora')
const pLimit = require('p-limit')
const path = require('path')
const filenamify = require('filenamify')
const fs = require('fs')

const cli = meow(`
Usage
    $ fastcampus <?courseUrl>

Options
    --debug
    --all, -a
    --concurrency, -c

Examples
    $ fastcampus --all
    $ fastcampus 000001
    $ fastcampus /course/enrolled/000001
`, {
    flags: {
        help: { alias: 'h' },
        version: { alias: 'v' },
        debug: { type: 'boolean' },
        all: { type: 'boolean', alias: 'a' },
        concurrency: { alias: 'c', default: 10 }
    }
})

;(async () => {
    if (!cli.flags.all && cli.input.length === 0) panic('Required a course Id or url. See help(--help) for details.')

    const email = await askOrExit({ message: 'Please enter your fastcampus email.', type: 'text', validate: isEmail })
    const password = await askOrExit({ message: 'Please enter your fastcampus password.', type: 'password' })

    /** @type {Client} */
    const client = await logPromise(Client.attemptLogin({ email, password }), 'Attempting login.', 'Login succeed!')

    const courseIds = cli.flags.all
        ? await logPromise(client.getCourseIds(), 'Scanning courses...', 'Scan completed.')
        : cli.input
            .map(str => str.match(/(?:\b|\D)(\d{6})\/?$/))
            .filter(Boolean)
            .map(([, courseId]) => courseId)

    if (courseIds.length === 0) panic('There are no courses available for download.')

    const cwd = process.cwd()
    const rootDir = (await askOrExit({
        type: 'text',
        message: 'Enter the directory to save.',
        initial: cwd
    })) || cwd
    const isOverwrite = await askOrExit({
        type: 'confirm',
        message: 'Do you want to overwrite when the filename is same?',
        initial: false
    })

    const limit = pLimit(cli.flags.concurrency)
    const cnt = { video: 0, file: 0, course: 0 }
    const spinText = () => `downloading.. [${cnt.course}/${courseIds.length}, videos: ${cnt.video}, files: ${cnt.file}]`
    const spin = ora(spinText()).start()

    const pTasks = courseIds.map(async courseId => {
        const course = await limit(() => client.getCourseById(courseId))
        const saveDir = path.resolve(cwd, rootDir, filenamify(course.title))
        fs.promises.mkdir(saveDir, { recursive: true }).catch(noop)

        await Promise.all(course.lectureLinks
            .map(async (link, lectureNo) => {
                const lecture = await limit(() => client.getLectureByLink(link))

                await Promise.all([
                    ...lecture.files.map(async (file, fileNo) => {
                        const dest = path.join(saveDir, filePrefix(lectureNo, fileNo) + file.name)
                        if (!isOverwrite && fs.existsSync(dest)) return

                        await limit(() => downloadFile(file.url, dest)).catch(noop)
                        spin.text = spinText(cnt.file++)
                    }),
                    ...lecture.mediaIds.map(async (mediaId, mediaNo) => {
                        const info = await limit(() => client.getMediaInfo(mediaId)).catch(noop)
                        if (!info) return

                        const dest = path.join(saveDir, filePrefix(lectureNo, lecture.files.length + mediaNo) + info.name)
                        if (!isOverwrite && fs.existsSync(dest)) return

                        await limit(() => downloadMedia(info.video.url, dest))
                        spin.text = spinText(cnt.video++)
                    })
                ])
            })
        )
        spin.text = spinText(cnt.course++)
    })
    await Promise.all(pTasks).catch(err => {
        if (cli.flags.debug) console.log(err)
        panic(err.isCustom ? err.message : 'Occurred unknown error.')
    })
    spin.succeed()

    ora('Completed!').succeed()
})()

function panic (message) {
    console.log('\u001B[1K')
    ora(message).fail()
    process.exit(1)
}

function logPromise (promise, pending, succeed) {
    const spin = ora(pending).start()
    return promise
        .then(v => (spin.succeed(succeed), v))
        .catch(err => {
            if (cli.flags.debug) console.log(err)
            spin.fail(err.isCustom ? err.message : 'Occurred unknown error.')
            process.exit(1)
        })
}

function askOrExit (question) {
    return prompts({ name: 'value', ...question }, { onCancel: () => process.exit(0) }).then(r => r.value)
}

function noop () { }

function filePrefix (...numbers) {
    return numbers.map(num => String(num).padStart(3, 0)).join('_') + '_'
}
