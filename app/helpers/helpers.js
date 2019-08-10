// generic helpers
const { getMoneyData } = require('./helpers-moneybird');

// Check if account-id exists in Moneybird
// returns a promise, which resolves to true if OK, otherwise throws error
exports.checkAccount = function (accountID, auth) {
    return getMoneyData('/financial_accounts.json', auth)
        .then(accountList => {
            const accountsFound = JSON.parse(accountList).filter(it => (it.id === accountID));
            if (accountsFound.length === 1) return true;
            throw new Error('Account does not exist');
        })
}

// updates first object with details from second object
// works with arrays too
// if object is (or contains) arrays of objects containing [id] key, then does array update too
// returns (immutable) updated record
const patchObj = (original, update, id = 'id') => {
    if (Array.isArray(original) && Array.isArray(update)) { // both are arrays
        if (!original[0] || !original[0][id] || !update[0] || !update[0][id]) return [...update];
        var newArr = [];
        var newUpd = [...update];
        for (let i = 0; i < original.length; i++) {
            const originalItem = original[i];
            var changed = false;
            for (let j = 0; j < update.length; j++) {
                const updItem = update[j];
                if (originalItem[id] && originalItem[id] === updItem[id]) {
                    newArr.push(patchObj(originalItem, updItem, id));
                    newUpd = newUpd.filter(it => (it[id] !== updItem[id]));
                    changed = true;
                }
            }
            if (!changed) newArr.push(originalItem);
        }
        return newArr.concat(newUpd);
    }
    if (typeof update === 'object' && typeof original === 'object') { // not array, but maybe both object
        var newObj = Object.assign({}, update);
        Object.keys(update).forEach(key => {
            if (original[key] && update[key]) {
                newObj[key] = patchObj(original[key], update[key], id);
            }
        });
        return Object.assign({}, original, newObj)
    }
    return update;
}

exports.nowDate = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const twoStr = n => (n < 10) ? '0' + n : n;
    return now.getFullYear() + '-' + twoStr(month) + '-' + now.getDate()
        + 'T' + twoStr(hours) + ':' + twoStr(minutes) + ':' + twoStr(seconds) + '.000Z';
}

exports.patchObj = patchObj;