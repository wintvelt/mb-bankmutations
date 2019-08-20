const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { getFile, putPromise } = require('../handler-files/s3functions');
const { makeDetails, makeSystemFields, makeFirstLast,
    objFromArr, arrayToCSV, addError } = require('./convert-helpers');
const { validate } = require('../handler-config/config-helpers');
const { privateBucket } = require('../SECRETS');
const { sendHandler } = require('../handler-send/handler-send');

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
    const configFilename = `${accountID}/bank-config-${accountID}.json`;

    switch (event.httpMethod) {
        case 'POST':
            if (!event.body) return response(403, 'bad request');
            const filename = event.body.csv_filename.split('.');

            return getFile(configFilename, privateBucket)
                .then(config => {
                    let errors = null;
                    if (Array.isArray(config)) throw new Error('missing config file');
                    if (!event.body.csv_content) throw new Error('csv_content missing');
                    if (!event.body.csv_filename) throw new Error('csv_filename missing');
                    // check if required (detail) fields are mapped
                    const reqFieldErrors = validate(config);
                    reqFieldErrors.forEach(error => {
                        errors = addFieldError(error, errors);
                    });
                    if (!filename[1] || filename[1] !== 'csv') {
                        errors = addError({ csv_read_errors: 'bestandsnaam is niet .csv' }, errors)
                        return errors; // abort at this point
                    }
                    let csvArr = event.body.csv_content;
                    if (typeof event.body.csv_content === 'string') {
                        // need to parse csv string first
                        const separator = config.separator || ';'
                        const arr = csvString.split(/\n|\r/); // split string into lines
                        arr = arr.filter(line => (line.length > 0)); // remove empty lines if needed
                        if (arr.length < 2) {
                            errors = addError({ csv_read_errors: 'bestand bevat geen (leesbare) regels' }, errors)
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
                                errors = addError({ csv_read_errors: 'kan regels niet lezen' }, errors)
                            }
                            return row;
                        });
                    }
                    if (errors) return errors; // abort if csv cannot be read

                    let systemFields, detailsArr, firstLastFields;
                    console.log('check and fill system fields');
                    [systemFields, errors] = makeSystemFields(config, filename[0], accountID, errors);
                    console.log('check and fill details');
                    [detailsArr, errors] = makeDetails(csvArr, config, systemFields, errors);
                    console.log('check and fill global calculated fields');
                    [firstLastFields, errors] = makeFirstLast(config, csvArr, errors);
                    const csvSave = {
                        Bucket: privateBucket,
                        Key: accountID + '/' + event.body.csv_filename,
                        Body: (typeof event.body.csv_content === 'string') ?
                            event.body.csv_content : arrayToCSV(event.body.csv_content, config.separator),
                        ContentType: 'text/csv'
                    }
                    if (errors) {
                        return errors; // save csv and abort if there are errors
                    }
                    console.log('create output object');
                    const details = { 'financial_mutations_attributes': objFromArr(detailsArr) };
                    const outObj = {
                        financial_statement:
                            Object.assign({},
                                { financial_account_id: accountID },
                                systemFields,
                                firstLastFields,
                                details)
                    };
                    const newConfig = patchObj(config, { validated: true })
                    const configSave = {
                        Bucket: privateBucket,
                        Key: configFilename,
                        Body: JSON.stringify(newConfig),
                        ContentType: 'application/json'
                    }
                    const jsonSave = {
                        Bucket: privateBucket,
                        Key: accountID + '/' + filename[0] + '.json',
                        Body: JSON.stringify(outObj),
                        ContentType: 'application/json'
                    }
                    const sendEvent = {
                        body: { filename: filename[0] + '.json' },
                        path: "/send/" + accountID,
                        httpMethod: "POST",
                        isBase64Encoded: false,
                        headers: event.headers
                    }
                    return Promise.all([
                        putPromise(configSave),
                        putPromise(csvSave),
                        putPromise(jsonSave)
                    ])
                        .then(_ => {
                            return (event.body.convert_only) ?
                                outObj : sendHandler(sendEvent)
                        })
                })
                .then(res => {
                    return response(200, (res.body) ? res.body : res);
                })
                .catch(err => response(500, err.message));

        default:
            return response(405, 'not allowed');
            break;
    }
}