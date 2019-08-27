const { privateBucket } = require('../SECRETS');
const { patchObj } = require('../helpers/helpers');
const { getPromise, listPromise } = require('./s3functions');

const filterFiles = function (s3List, account) {
    const contents = s3List.Contents;
    return contents
        .filter(it => {
            const path = it.Key.split('/');
            return (path.length > 1 && path[0] === account && !path[1].includes('summary-'));
        })
        .map(it => Object.assign({}, { filename: it.Key, last_modified: it.LastModified }))
}

exports.sumsOf = function (account) {
    const listParams = {
        Bucket: privateBucket,
    }
    const summaryParams = {
        Bucket: privateBucket,
        Key: account + '/summary-' + account + '.json'
    }
    return Promise.all([
        listPromise(listParams),
        getPromise(summaryParams).catch(() => [])
    ])
        .then(dataList => {
            const rawList = filterFiles(dataList[0], account);
            const cleanList = combineSame(rawList);
            const summaries = dataList[1].map(it => Object.assign({}, it, { filename : it.filename.split('.')[0] }));
            const outObj = patchObj(cleanList, summaries, "filename");
            return outObj;
        })
}

const combineSame = (arr) => {
    return convertExt(arr)
        .sort((a, b) => {
            return (a.filename < b.filename) ? -1 :
                (a.filename > b.filename) ? 1 : 0;
        })
        .reduce((acc, curr) => {
            const last = acc.slice(-1)[0];
            if (last && curr.filename === last.filename) {
                const lastMod = Object.assign({}, last.last_modified, curr.last_modified);
                return [...acc.slice(0,-1), Object.assign({}, last, curr, { last_modified: lastMod })]
            } else {
                return [...acc, curr]
            }
        }, [])
}

const convertExt = (rawList) => {
    return rawList.map(it => {
        const fileType = extOf(it.filename);
        let newObj = { filename: noExt(it.filename) }
        if (fileType) {
            let modObj = {};
            modObj[fileType] = it.last_modified;
            newObj.last_modified = modObj;
        }
        return newObj;
    })
}

const noExt = (a) => {
    return a.split('.')[0]
}

const extOf = (a) => {
    return a.split('.')[1] || null;
}

exports.filterFiles = filterFiles;