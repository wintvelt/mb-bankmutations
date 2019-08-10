exports.filterFiles = function(s3List, account) {
    const contents = s3List.Contents;
    return contents
        .filter(it => {
            const path = it.Key.split('/');
            return (path.length > 1 && path[0] === account && !path[1].includes('summary-'));
        })
        .map(it => Object.assign({}, { filename: it.Key, last_modified: it.LastModified}))
}