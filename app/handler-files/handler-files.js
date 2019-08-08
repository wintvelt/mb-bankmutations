// Read and write files and folders on S3
const { privateBucket } = require('../SECRETS');
const { checkAccount } = require('../helpers/helpers');
const { getPromise, putPromise, deletePromise, listPromise } = require('./s3functions');
const { filterFiles } = require('./helpers-files');
const { response, patchObj } = require('../helpers/helpers-api');

exports.fileHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');

    return checkAccount(pathParams[2], auth)
        .then(() => filesSwitchHandler(event))
        .catch(err => response(403, err.message))
}

const filesSwitchHandler = function(event) {
    const pathParams = event.path.split('/');

    switch (event.httpMethod) {
        case 'GET':
            if (pathParams.length === 4) {
                const filename = pathParams[2]+'/'+pathParams[3];
                console.log(filename);
                const getParams = {
                    Bucket: privateBucket,
                    Key: filename
                }
                return getPromise(getParams)
                .then(data => {
                    console.log(typeof data);
                    return response(200, data);
                })
                .catch(err => response(500, 'file not found'));
            }
            if (pathParams.length === 3) {
                const account = pathParams[2];
                const listParams = {
                    Bucket: privateBucket,
                }
                const summaryParams = {
                    Bucket: privateBucket,
                    Key: account +'/summary-'+ account +'.json'
                }
                return Promise.all([
                    listPromise(listParams),
                    getPromise(summaryParams).catch(() => 'not found')
                ])
                .then(dataList => {
                    const rawList = filterFiles(dataList[0], account);
                    const summaries = dataList[1];
                    if (summaries === 'not found') return response(200, rawList);
                    return response(200, patchObj(rawList, summaries, "filename"));
                })
                .catch(err => response(500, 'server error'));
            }
            return response(403, 'invalid path');

        case 'POST':
            if (!event.body) return response(400, 'Bad request');
            const postBody = event.body;
            if (!postBody.filename || !postBody.data) return response(400, 'Bad request');
            const postAccount = pathParams[2];
            const postFilename = postAccount + '/' + postBody.filename
            const postParams = {
                Bucket: privateBucket,
                Key: postFilename,
                Body: JSON.stringify(postBody.data),
                ContentType: 'application/json'
            }
            return putPromise(postParams)
                .then(data => {
                    return response(200, data);
                })
                .catch(err => response(500, 'could not save file'));

        case 'DELETE':
            if (!event.body) return response(400, 'Bad request');
            const delBody = event.body;
            if (!delBody.filename) return response(400, 'Bad request');
            const delAccount = pathParams[2];
            const delFilename = delAccount + '/' + delBody.filename
            const delParams = {
                Bucket: privateBucket,
                Key: delFilename
            }
            return deletePromise(delParams)
                .then(data => response(200, data))
                .catch(err => response(500, 'could not delete file'));

        default:
            return response(405, 'not allowed');
    }

}