// Read and write files and folders on S3
const { privateBucket } = require('../SECRETS');
const { checkAccount } = require('../helpers/helpers');
const { getPromise } = require('../handler-files/s3functions');
const { response } = require('../helpers/helpers-api');

exports.downloadHandler = function (event) {
    const auth = event.headers.Authorization;
    const pathParams = event.path.split('/');

    return downloadSwitchHandler(event);

    // TODO: Add check later (after fixing MB manager to also send Auth header)
    // return checkAccount(pathParams[2], auth)
    //     .then(() => downloadSwitchHandler(event))
    //     .catch(err => response(403, err.message))
}

const downloadSwitchHandler = function (event) {
    const pathParams = event.path.split('/');

    switch (event.httpMethod) {
        case 'GET':
            if (pathParams.length !== 4) return response(403, 'wrong path')
            const filename = decodeURI(pathParams[3]);
            const fullFilename = pathParams[2] + '/' + filename;
            const getParams = {
                Bucket: privateBucket,
                Key: fullFilename
            }
            console.log('getting ' + fullFilename);
            return getPromise(getParams)
                .then(data => {
                    console.log('gotdata');
                    return responseWithDownLoad(200, data, filename);
                })
                .catch(err => response(500, 'file not found'));

        default:
            return response(405, 'not allowed');
    }

}

const responseWithDownLoad= (code, data, filename) => {
    return {
        'isBase64Encoded': false,
        'statusCode': code,
        'headers': {
            'Content-Type': 'text/csv',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
            'Access-Control-Max-Age': '86400',
            'Access-Control-Allow-Credentials': true,
            'Access-Control-Allow-Headers':
                'X-Requested-With, X-HTTP-Method-Override, Content-Type, Authorization, Origin, Accept',
            'Content-Disposition': `attachment; filename=${filename}`
        },
        'body': data
    };    
}