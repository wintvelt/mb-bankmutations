const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile, putPromise } = require('../handler-files/s3functions');
const { privateBucket } = require('../SECRETS');

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
                    return response(200, data);
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
                    return putPromise(postParams)
                })
                .then(data => {
                    return response(200, data);
                })
                .catch(err => response(500, err.message));

        case 'OPTIONS':
            return response(200, 'ok');

        default:
            return response(405, 'not allowed');
            break;
    }
}

const emptyMapping = {
    "financial_account_id": { "system": true }, // system generated, = account id from request path
    "reference": { "manual": true }, // manually set by user
    "official_date": { "manual": true, "format": "yyyy-mm-dd" }, // manually set by user
    "official_balance": null,
    "details": {
        "date": null,
        "valutation_date": null,
        "message": null,
        "amount": null,
        "code": null,
        "contra_account_name": null,
        "contra_account_number": null,
        "batch_reference": null,
        "offset": null,
        "account_servicer_transaction_id": null
    },
    "separator": ";",
    "decimal": ",",
    "unmapped": []
}