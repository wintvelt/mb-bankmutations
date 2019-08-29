const { privateBucket } = require('../SECRETS');
const { checkAccount, patchObj, nowDate } = require('../helpers/helpers');
const { getPromise, getFile, putPromise } = require('../handler-files/s3functions');
const { sumsOf } = require('../handler-files/helpers-files');
const { response } = require('../helpers/helpers-api');
const { postMoneyData } = require('../helpers/helpers-moneybird');

exports.sendHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');

    return checkAccount(pathParams[2], auth)
        .then(() => sendSwitchHandler(event))
        .catch(err => response(403, err.message))
}

const sendSwitchHandler = function (event) {
    const pathParams = event.path.split('/');
    if (!event.body) return response(403, 'body missing from request');
    if (!event.body.filename && !event.body.json) return response(403, 'invalid body');
    if (pathParams.length !== 3) return response(403, 'invalid path parameters');
    const account = pathParams[2];

    switch (event.httpMethod) {
        case 'POST':
            if (event.body && event.body.filename) {
                const filename = account + '/' + event.body.filename;
                const sumsfile = account + '/summary-' + account + '.json';
                const getMutations = {
                    Bucket: privateBucket,
                    Key: filename
                }
                console.log('sumsfile ' + sumsfile);
                return getPromise(getMutations)
                    .then(data => {
                        console.log('got mutations');

                        // post the data to moneybird + get sumsfile
                        // return data;
                        return Promise.all([
                            postMoneyData('/financial_statements', event.headers.Authorization, data),
                            getFile(sumsfile, privateBucket)
                        ])
                    })
                    .then(([resMB, resAWS]) => {
                        console.log('error slipped');
                        console.log(Object.keys(resMB));
                        return resMB && resMB.error
                    })
                    // .then(dataList => {
                    //     // udpate sumsfile and post + get raw list from directory
                    //     // return dataList;
                    //     console.log('got data')
                    //     const mbData = JSON.parse(dataList[0]);
                    //     const oldSummaries = dataList[1];
                    //     const newSummary = {
                    //         filename,
                    //         last_sent: nowDate(),
                    //         send_result_ok: (mbData.id) ? true : false,
                    //         id: mbData.id
                    //     }
                    //     const newSummaries = patchObj(oldSummaries, [newSummary], 'filename');
                    //     const postParams = {
                    //         Bucket: privateBucket,
                    //         Key: sumsfile,
                    //         Body: JSON.stringify(newSummaries),
                    //         ContentType: 'application/json'
                    //     }
                    //     return putPromise(postParams);
                    // })
                    // .then((_) => {
                    //     return sumsOf(account);
                    // })
                    .then(sums => response(200, sums))
                    .catch(err => {
                        console.log('caught error');
                        try {
                            console.log(Object.keys(err.body));
                        } catch (_) {
                            console.log('attempt failed')
                        }
                        return response(500, err.message)
                    });
            }
            // When there is no filename
            return response(500, 'invalid post body');


        default:
            return response(405, 'not allowed');
    }

}