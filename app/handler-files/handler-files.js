// Read and write files and folders on S3
const { privateBucket } = require('../SECRETS');
const { checkAccount } = require('../helpers/helpers');
const { getPromise, putPromise, deletePromise, listPromise } = require('./s3functions');
const { sumsOf } = require('./helpers-files');
const { response } = require('../helpers/helpers-api');

exports.fileHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');

    return checkAccount(pathParams[2], auth)
        .then(() => filesSwitchHandler(event))
        .catch(err => response(403, err.message))
}

const filesSwitchHandler = function (event) {
    const pathParams = event.path.split('/');

    switch (event.httpMethod) {
        case 'GET':
            if (pathParams.length === 4) {
                const filename = pathParams[2] + '/' + pathParams[3];
                const getParams = {
                    Bucket: privateBucket,
                    Key: filename
                }
                console.log('getting '+filename);
                return getPromise(getParams)
                    .then(data => {
                        console.log('gotdata');
                        return response(200, data);
                    })
                    .catch(err => response(500, 'file not found'));
            }
            if (pathParams.length === 3) {
                const account = pathParams[2];
                return sumsOf(account)
                    .then(sums => response(200, sums))
                    .catch(err => response(500, err.message));
            }
            return response(403, 'invalid path');

        case 'POST':
            if (!event.body) return response(400, 'Bad request');
            const postBody = (typeof event.body === 'string')? event.body : JSON.stringify(event.body);
            const postAccount = pathParams[2];
            const postFilename = postAccount + '/' + pathParams[3];
            const postParams = {
                Bucket: privateBucket,
                Key: postFilename,
                Body: postBody,
                ContentType: 'application/json'
            }
            return putPromise(postParams)
                .then(data => {
                    return response(200, data);
                })
                .catch(err => response(500, err.message));

        case 'DELETE':
            if (!event.body) return response(400, 'Bad request');
            const delBody = event.body;
            if (!delBody || !delBody.filename) return response(400, 'Bad request');
            const delAccount = pathParams[2];
            const delFilename = delAccount + '/' + delBody.filename
            const delParams = {
                Bucket: privateBucket,
                Key: delFilename
            }
            return deletePromise(delParams)
                .then(data => response(200, data))
                .catch(err => response(500, err.message));

        default:
            return response(405, 'not allowed');
    }

}