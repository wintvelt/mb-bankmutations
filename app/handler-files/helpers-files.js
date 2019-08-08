exports.filterFiles = function(s3List, account) {
    const contents = s3List.Contents;
    return contents
        .filter(it => (it.Key.split('/').length > 1 && it.Key.split('/')[0] === account))
        .map(it => Object.assign({}, { filename: it.Key, last_modified: it.LastModified}))
}