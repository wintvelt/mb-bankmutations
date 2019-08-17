const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile, putPromise } = require('../handler-files/s3functions');
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
    const configFilename = accountID + '/' + event.body.config;

    switch (event.httpMethod) {
        case 'POST':
            if (!event.body) return response(403, 'bad request');
            return getFile(configFilename, privateBucket)
                .then(config => {
                    if (Array.isArray(config)) throw new Error('missing config file');
                    if (validate(config).length > 0) throw new Error('invalid config');
                    if (!event.body.csv_content) throw new Error('csv_content missing');
                    let csvArr = event.body.csv_content;
                    if (typeof event.body.csv_content === 'string') {
                        // need to parse csv string first
                        const separator = config.separator || ';'
                        const arr = csvString.split(/\n|\r/);
                        if (!arr[arr.length - 1]) arr = arr.slice(0, -1);
                        if (arr.length < 2) throw new Error('csv content invalid');
                        csvArr = arr.map(it => {
                            let row;
                            try {
                                row = JSON.parse('['+it+']');
                            } catch (_) {
                                row = it.split(separator);
                            }
                            if (!row[row.length - 1]) row = row.slice(0, -1);
                            return row;
                        });
                    }
                    console.log(1);
                    const manualFields = makeManual(event.body, config);
                    console.log(2);
                    const detailsArr = makeDetails(csvArr, config, manualFields);
                    console.log(3);
                    const firstLastFields = makeFirstLast(config, csvArr);
                    console.log(4);
                    const details = { 'financial_mutations_attributes': objFromArr(detailsArr) };
                    const outObj = Object.assign({},
                        { financial_account_id: accountID },
                        manualFields,
                        firstLastFields,
                        details);
                    const newConfig = patchObj(config, { validated: true })
                    const configSave = {
                        Bucket: privateBucket,
                        Key: configFilename,
                        Body: JSON.stringify(newConfig),
                        ContentType: 'application/json'
                    }
                    return Promise.all([
                        putPromise(configSave),
                        { financial_statement: outObj }
                    ])
                })
                .then(dataList => {
                    return response(200, dataList[1]);
                })
                .catch(err => response(500, err.message));

        default:
            return response(405, 'not allowed');
            break;
    }
}