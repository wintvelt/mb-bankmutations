const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile, putPromise } = require('../handler-files/s3functions');
const { makeDetails, makeSystemFields, makeFirstLast, objFromArr } = require('./convert-helpers');
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
                    let errors = null;
                    if (Array.isArray(config)) throw new Error('missing config file');
                    if (!event.body.csv_content) throw new Error('csv_content missing');
                    if (!event.body.csv_filename) throw new Error('csv_filename missing');
                    // check if required (detail) fields are mapped
                    const reqFieldErrors = validate(config);
                    if (reqFieldErrors.length > 0) errors = { field_errors: reqFieldErrors }
                    const filename = event.body.csv_filename.split('.');
                    if (!filename[1] || filename[1] !== 'csv') {
                        errors = Object.assign([], errors, { csv_read_error: 'bestandsnaam is niet .csv' })
                        return [errors, null]; // abort at this point
                    }
                    let csvArr = event.body.csv_content;
                    if (typeof event.body.csv_content === 'string') {
                        // need to parse csv string first
                        const separator = config.separator || ';'
                        const arr = csvString.split(/\n|\r/); // split string into lines
                        arr = arr.filter(line => (line.length > 0)); // remove empty lines if needed
                        if (arr.length < 2) {
                            errors = Object.assign([], errors, { csv_read_error: 'bestand bevat geen (leesbare) regels' })
                        }
                        csvArr = arr.map(it => {
                            let row;
                            try {
                                row = JSON.parse('[' + it + ']');
                            } catch (_) {
                                row = it.split(separator);
                            }
                            if (!row[row.length - 1]) row = row.slice(0, -1); // remove last empty fields if needed
                            if (Math.abs(row.length - arr[0].length) > 2) {
                                errors = Object.assign([], errors, { csv_read_error: 'kan regels niet lezen' })
                            }
                            return row;
                        });
                    }
                    if (errors) return [errors, null]; // abort if csv cannot be read

                    let systemFields, detailsArr, firstLastFields;
                    console.log('check and fill system fields');
                    [systemFields, errors] = makeSystemFields(config, filename[0], accountID, errors);
                    console.log('check and fill details');
                    [detailsArr, errors] = makeDetails(csvArr, config, systemFields, errors);
                    console.log('check and fill global calculated fields');
                    [firstLastFields, errors] = makeFirstLast(config, csvArr, errors);
                    const csvSave = {
                        Bucket: privateBucket,
                        Key: accountID + '/' + event.body.filename,
                        Body: (typeof event.body.csv_content === 'string') ?
                            event.body.csv_content : JSON.stringify(event.body.csv_content),
                        ContentType: 'text/csv'
                    }
                    if (errors) return [errors, putPromise(csvSave)]; // save csv and abort if there are errors

                    console.log('create output object');
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
                        { financial_statement: outObj },
                        putPromise(configSave),
                        putPromise(csvSave)
                    ])
                })
                .then(dataList => {
                    return response(200, dataList[0]);
                })
                .catch(err => response(500, err.message));

        default:
            return response(405, 'not allowed');
            break;
    }
}