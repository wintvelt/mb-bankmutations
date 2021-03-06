// Read and write files and folders on S3
var { S3 } = require('aws-sdk');
const { secretID, secretKey } = require('../SECRETS');

// get reference to S3 client 
var s3 = new S3({
    accessKeyId: secretID,
    secretAccessKey: secretKey,
    region: 'eu-central-1'
});


const getPromise = function (params) {
    return new Promise(function (resolve, reject) {
        s3.getObject(params,
            (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    if (data.Body) {
                        const buffer = Buffer.from(data.Body);
                        try {
                            const newData = JSON.parse(buffer.toString('utf8'));
                            resolve(newData);                                
                        } catch (error) {
                            const newData = buffer.toString('utf8');
                            resolve(newData);
                        }
                    }
                    resolve(data);
                }
            }
        );
    });
}

exports.putPromise = function (params) {
    return new Promise(function (resolve, reject) {
        s3.putObject(params,
            (err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            }
        );
    });
}

exports.deletePromise = function (params) {
    return new Promise(function (resolve, reject) {
        s3.deleteObject(params,
            (err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            }
        );
    });
}

exports.listPromise = function (params) {
    return new Promise(function (resolve, reject) {
        s3.listObjects(params,
            (err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            }
        );
    });
}

// File promise that always resolves (empty file returns [])
exports.getFile = function (filename, bucket) {
    return getPromise({ Bucket: bucket, Key: filename })
        .catch(err => {
            console.log(`file ${filename} not found`);
            return [];
        });
}

// File promise that always resolves (empty file returns [])
exports.getFileWithDate = function (fileName, bucket) {
    return getPromise({ Bucket: bucket, Key: fileName })
        .then(data => {
            const buffer = Buffer.from(data.Body);
            return new Promise((resolve, reject) => {
                const outObj = {
                    list: JSON.parse(buffer.toString('utf8')),
                    syncDate: data.LastModified
                }
                resolve(outObj);
            });
        })
        .catch(err => new Promise((resolve, reject) => resolve([])));
}
exports.getPromise = getPromise;