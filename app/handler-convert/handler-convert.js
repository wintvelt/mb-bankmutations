const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile } = require('../handler-files/s3functions');
const { makeDetails, makeManual, makeFirstLast, objFromArr } = require('./convert-helpers');
const { validate } = require('../handler-config/config-helpers');
const { privateBucket } = require('../SECRETS');

exports.convertHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');
    if (pathParams.length < 3) return response(403, 'invalid path');

    return checkAccount(pathParams[2], auth)
        .then(() => convertSwitchHandler(event))
        .catch(err => response(403, err.message))
}

const convertSwitchHandler = (event) => {
    const pathParams = event.path.split('/');
    const accountID = pathParams[2];
    const filename = accountID + '/' + event.body.config;

    switch (event.httpMethod) {
        case 'POST':
            if (!event.body) return response(403, 'bad request');
            return getFile(filename, privateBucket)
                .then(config => {
                    if (Array.isArray(config)) throw new Error('missing config file');
                    if (validate(config).length > 0) throw new Error('invalid config');
                    if (!event.body.csv_content) throw new Error('csv_content missing');
                    // INSERT HERE CHECK IF OBJECT OR STRING (2x)
                    var csvArr = event.body.csv_content;
                    if (typeof event.body.csv_content === 'string') {
                        const separator = config.separator || ';'
                        var arr = event.body.csv_content.split('\r');
                        if (!arr[arr.length-1]) arr = arr.slice(0,-1);
                        if (arr.length < 2) throw new Error('csv content invalid');
                        csvArr = arr.map(it => {
                            var row = it.split(separator);
                            if (!row[row.length-1]) row = row.slice(0,-1);
                        });
                    }
                    console.log(1);
                    const manualFields = makeManual(event.body, config);
                    console.log(2);
                    const detailsArr = makeDetails(csvArr, config, manualFields);
                    console.log(3);
                    const firstLastFields = makeFirstLast(config, csvArr);
                    console.log(4);
                    const details = {'financial_mutations_attributes': objFromArr(detailsArr) };
                    const outObj = Object.assign({},
                        { financial_account_id: accountID },
                        manualFields,
                        firstLastFields,
                        details);
                    return response(200, { financial_statement : outObj });
                })
                .catch(err => response(500, err.message));

        case 'OPTIONS':
            return response(200, 'ok');

        default:
            return response(405, 'not allowed');
            break;
    }
}