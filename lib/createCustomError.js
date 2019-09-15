module.exports = message => Object.assign(new Error(message), { isCustom: true })

module.exports.type = message => Object.assign(new TypeError(message), { isCustom: true })
