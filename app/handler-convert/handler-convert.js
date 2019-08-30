const { response } = require('../helpers/helpers-api');
const { checkAccount, patchObj } = require('../helpers/helpers');
const { putPromise, getPromise, deletePromise } = require('../handler-files/s3functions');
const { makeDetails, makeSystemFields, makeFirstLast, addFieldError,
    objFromArr, arrayToCSV, addError, handleMbRes, checkIdentifier } = require('./convert-helpers');
const { cleanPaypal } = require('./convert-helpers-paypal');

const { validate } = require('../handler-config/config-helpers');
const { privateBucket } = require('../SECRETS');
const { sendHandler } = require('../handler-send/handler-send');
const { emptyMapping } = require('../handler-config/config-helpers');

exports.convertHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');
    if (pathParams.length < 3) return response(403, 'invalid path');

    return checkAccount(pathParams[2], auth)
        .then((account) => convertSwitchHandler(event, account))
        .catch(err => response(403, err.message))
}

const convertSwitchHandler = (event, account) => {
    console.log('start conversion');
    const pathParams = event.path.split('/');
    const accountID = pathParams[2];
    const configFilename = `${accountID}/bank-config-${accountID}.json`;

    switch (event.httpMethod) {
        case 'POST':
            console.log('start convert');
            if (!event.body || !event.body.csv_filename) return response(403, 'bad request');
            const filename = event.body.csv_filename.split('.');
            const fullFilename = `${accountID}/${event.body.csv_filename}`;
            console.log(fullFilename);

            return Promise.all([
                getPromise({ Bucket: privateBucket, Key: configFilename }).catch(_ => emptyMapping),
                event.body.csv_content || getPromise({ Bucket: privateBucket, Key: fullFilename })
            ])
                .then(([config, csv_content]) => {
                    console.log('got config');
                    let errors = null; // NB ERRORS IS A MUTABLE VARIABLE
                    if (Array.isArray(config)) throw new Error('missing config file');
                    if (!filename[1] || filename[1].toLowerCase() !== 'csv') {
                        errors = addError({ csv_read_errors: 'bestandsnaam is niet .csv' }, errors)
                        console.log('error met bestandsnaam');
                        return errors; // abort at this point
                    }
                    let csv = csv_content;

                    if (typeof csv === 'string') {
                        // need to parse csv string first
                        const separator = config.separator || ';'
                        let arr = csv.split(/\n|\r/); // split string into lines
                        arr = arr.filter(line => (line.length > 0)); // remove empty lines if needed
                        if (arr.length < 2) {
                            errors = addError({ csv_read_errors: 'bestand bevat geen (leesbare) regels' }, errors)
                        }
                        csv = arr.map((it, i) => {
                            let row;
                            try {
                                row = JSON.parse('[' + it + ']');
                            } catch (_) {
                                row = it.split(separator);
                            }
                            if (!row[row.length - 1]) row = row.slice(0, -1); // remove last empty fields if needed
                            if (row.length > arr[0].length) {
                                errors = addError({ csv_read_errors: `regels lijken te veel velden te hebben` }, errors)
                            }
                            return row;
                        });
                    }
                    if (errors) {
                        console.log('er zijn andere errors');
                        return errors; // abort if csv cannot be read
                    }

                    // check if required (detail) fields are mapped
                    console.log('check required fields mapping');
                    const reqFieldErrors = validate(config);
                    reqFieldErrors.forEach(error => {
                        errors = addFieldError(error, errors);
                    });
                    console.log('check (optional) identifier field in column');
                    errors = checkIdentifier(config, csv, account, errors);
                    let systemFields, detailsArr, firstLastFields;
                    console.log('check and fill system fields');
                    [systemFields, errors] = makeSystemFields(config, filename[0], accountID, errors);
                    console.log('check and fill details');
                    const cleanCsv = (config.paypal_special) ? cleanPaypal(csv) : csv;
                    [detailsArr, errors] = makeDetails(cleanCsv, config, systemFields, errors);
                    console.log('check and fill global calculated fields');
                    [firstLastFields, errors] = makeFirstLast(config, cleanCsv, errors);
                    console.log('made firstlast fields');
                    const csvSave = {
                        Bucket: privateBucket,
                        Key: accountID + '/' + event.body.csv_filename,
                        Body: (typeof csv_content === 'string') ?
                            csv_content : arrayToCSV(csv_content, config.separator),
                        ContentType: 'text/csv'
                    }
                    const result = { errors: errors && errors.errors, csv: csv };
                    if (errors) { // save csv if needed and abort if there are errors
                        return (event.body.csv_content) ?
                            putPromise(csvSave).then(_ => result)
                            : result;
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
                            console.log('saved files after convert');
                            return (event.body.convert_only) ?
                                result : sendHandler(sendEvent)
                                    .then(res => handleMbRes(result, res))
                        })
                })
                .then(res => {
                    return response(200, res);
                })
                .catch(err => response(500, err.message));

        case 'DELETE':
            // check filename
            if (!event.body || !event.body.csv_filename) return response(403, 'bad request');
            const jsonFilename = fullFilename.split('.')[0] + '.json';
            const sumFilename = `${accountID}/'summary-${event.body.csv_filename}.json`;

            // get summaries
            return getPromise({ Bucket: privateBucket, Key: sumFilename }).catch(_ => [])
                .then(sumFile => {
                    // update summaries with 'deleted' flag (to preserve link to moneybird file)
                    const newSum = sumFile.map(it => {
                        return (it.filename === jsonFilename) ?
                            { ...it, deleted: true }
                            : it
                    })
                    // delete files and post summaries
                    return Promise.all([
                        (sum.length > 0) ?
                            putPromise({
                                Bucket: privateBucket,
                                Key: sumFilename,
                                Body: JSON.stringify(newSum),
                                ContentType: 'application/json'
                            }) : '',
                        deletePromise({
                            Bucket: privateBucket,
                            Key: fullFilename
                        }),
                        deletePromise({
                            Bucket: privateBucket,
                            Key: jsonFilename
                        })
                    ]);
                })
                .then(_ => response(200, 'ok'))
                .catch(err => response(500, err.message));

        default:
            return response(405, 'not allowed');
    }
}