// dependencies
const { fileHandler } = require('./handler-files/handler-files');
const { configHandler } = require('./handler-config/handler-config');
const { convertHandler } = require('./handler-convert/handler-convert');
const { sendHandler } = require('./handler-send/handler-send');
const { response } = require('./helpers/helpers-api');
const { accessToken } = require('./SECRETS');

exports.handler = async function (event) {
    // helper for localhost connection to Moneybird
    const auth = (process.env.AWS_SAM_LOCAL) ? 'Bearer ' + accessToken : event.headers.Authorization;
    const newHeaders = Object.assign({}, event.headers, { Authorization: auth });
    var newBody = null;
    try {
        if (event.body && typeof event.body === 'string') newBody = JSON.parse(event.body);
    } catch (_) {
    }
    if (event.body) newBody = event.body;
    const newEvent = Object.assign({}, event, { body: newBody }, { headers: newHeaders });

    const pathList = event.path.split('/');

    switch (pathList[1]) {
        case 'config':
            return configHandler(newEvent);
            break;

        case 'files':
            return fileHandler(newEvent);
            break;

        case 'convert':
            return convertHandler(newEvent);
            break;

        case 'send':
            return sendHandler(newEvent);
            break;

        default:
            return response(404, 'not found');
            break;
    }

}