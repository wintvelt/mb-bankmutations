// dependencies
const { fileHandler } = require('./handler-files/handler-files');
const { configHandler } = require('./handler-config/handler-config');
const { convertHandler } = require('./handler-convert/handler-convert');
const { sendHandler } = require('./handler-send/handler-send');
const { downloadHandler } = require('./handler-download/handler-download');
const { response } = require('./helpers/helpers-api');
const { accessToken } = require('./SECRETS');

exports.handler = async function (event) {
    // helper for localhost connection to Moneybird
    if (event.httpMethod === 'OPTIONS') return response(200, 'ok');

    const auth = (process.env.AWS_SAM_LOCAL) ? 'Bearer ' + accessToken : event.headers.Authorization;
    const newHeaders = Object.assign({}, event.headers, { Authorization: auth });
    let newBody = null;
    try {
        if (event.body && typeof event.body === 'string') {
            newBody = JSON.parse(event.body);
        };
    } catch (_) {
    }
    if (!newBody && event.body) newBody = Object.assign({}, event.body);
    console.log('request for ' + event.path);
    const newEvent = Object.assign({}, event, { body: newBody }, { headers: newHeaders });

    const pathList = event.path.split('/');

    switch (pathList[1]) {
        case 'config':
            return configHandler(newEvent);

        case 'files':
            return fileHandler(newEvent);

        case 'convert':
            return convertHandler(newEvent);

        case 'send':
            return sendHandler(newEvent);

        case 'download':
            return downloadHandler(newEvent);

        default:
            return response(404, 'not found');
    }

}