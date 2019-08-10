const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile, putPromise } = require('../handler-files/s3functions');
const { privateBucket } = require('../SECRETS');
const { emptyMapping, validate } = require('./config-helpers');

exports.configHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');
    if (pathParams.length < 3) return response(403, 'invalid path');

    return checkAccount(pathParams[2], auth)
        .then(() => configSwitchHandler(event))
        .catch(err => response(403, err.message))
}

const configSwitchHandler = (event) => {
    const pathParams = event.path.split('/');
    const accountID = pathParams[2];
    const filename = accountID + '/bank-config-' + accountID + '.json';

    switch (event.httpMethod) {
        case 'GET':
            return getFile(filename, privateBucket)
                .then(config => {
                    if (config instanceof Array && config.length === 0) return response(200, emptyMapping);
                    return response(200, config)
                });

        case 'POST':
            if (!event.body) return response(403, 'bad request');
            const postParams = {
                Bucket: privateBucket,
                Key: filename,
                Body: JSON.stringify(event.body),
                ContentType: 'application/json'
            }
            return putPromise(postParams)
                .then(data => {
                    return response(200, validate(event.body));
                })
                .catch(err => response(500, 'unable to save file'));

        case 'PATCH':
            if (!event.body) return response(403, 'bad request');
            return getFile(filename, privateBucket)
                .then(config => {
                    if (config instanceof Array && config.length === 0) return emptyMapping;
                    return config;
                })
                .then(config => {
                    const newConfig = patchObj(config, event.body);
                    const postParams = {
                        Bucket: privateBucket,
                        Key: filename,
                        Body: JSON.stringify(newConfig),
                        ContentType: 'application/json'
                    }
                    return Promise.all([
                        putPromise(postParams),
                        newConfig
                    ])
                })
                .then(dataList => {
                    return response(200, validate(dataList[1]));
                })
                .catch(err => response(500, err.message));

        case 'OPTIONS':
            return response(200, 'ok');

        default:
            return response(405, 'not allowed');
            break;
    }
}