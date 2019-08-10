const makeDetails = (csvArr, config, manualFields) => {
    const mutArr = makeMutArr(csvArr, config, manualFields);
    return mutArr;
}

const makeManual = (body, config) => {
    const manualFieldList = Object.keys(config)
        .map(key => {
            return { key, value: config[key] }
        })
        .filter(it => (typeof it.value === 'object' && it.value.manual))
        .map(it => it.key);
    var outObj = {};
    for (let i = 0; i < manualFieldList.length; i++) {
        const key = manualFieldList[i];
        if (body[key]) {
            outObj[key] = body[key];
        }
    }
    if (Object.keys(outObj).length < manualFieldList.length) throw new Error('missing manual fields');
    return outObj;
}

const makeMutArr = (csvArr, config, manualFields) => {
    const decimal = config.decimal || ',';
    const headers = csvArr[0];
    var outArr = [];
    for (let i = 1; i < csvArr.length; i++) {
        const csvRow = csvArr[i];
        var outObj = {};
        for (const key in config.details) {
            const fieldConfig = config.details[key];
            if (fieldConfig) {
                var rawValue;
                if (fieldConfig.fromManual) {
                    if (!fieldConfig.key || !manualFields[fieldConfig.key]) throw new Error('invalid fromManual config');
                    rawValue = manualFields[fieldConfig.key]
                } else {
                    rawValue = makeRawValue(fieldConfig, headers, csvRow);
                }
                outObj = Object.assign(outObj, makeField(key, fieldConfig, rawValue, decimal, manualFields));
            }
        }
        outArr.push(outObj)
    }
    return outArr;
}

const makeRawValue = (fieldConfig, headers, csvRow) => {
    const fields = (typeof fieldConfig === 'string') ? [fieldConfig]
        : (typeof fieldConfig.field === 'string') ? [fieldConfig.field]
            : fieldConfig.field;
    const value = fields
        .map((field) => {
            const fieldIndex = headers.indexOf(field);
            if (fieldIndex === -1) throw new Error('config header not found in csv');
            return csvRow[fieldIndex];
        })
        .join(' - ');
    return value;
}

const makeField = (key, fieldConfig, rawValue, decimal, manualFields) => {
    var outObj = {}
    if (!rawValue || typeof fieldConfig === 'string') {
        outObj[key] = rawValue;
        return outObj;
    }
    if (fieldConfig.beautify) {
        const valSingleSpace = rawValue.replace(/\"/g, '').replace(/\s\s+/g, ' ');
        outObj[key] = initCaps(valSingleSpace);
        return outObj;
    }
    if (fieldConfig.formatFrom) {
        if (!fieldConfig.formatTo) throw new Error('missing formatTo');
        const ymd = getDate(rawValue, fieldConfig.formatFrom);
        const outValue = putDate(ymd, fieldConfig.formatTo);
        outObj[key] = outValue;
        return outObj;
    }
    if (fieldConfig.match) {
        if (!fieldConfig.match || !fieldConfig.length || !fieldConfig.offset) throw new Error('invalid match format');
        const index = rawValue.indexOf(fieldConfig.match);
        if (index === -1) {
            outObj[key] = null;
            return outObj;
        }
        const offset = (typeof fieldConfig.offset === 'string') ? parseInt(fieldConfig.offset) : fieldConfig.offset;
        const length = (typeof fieldConfig.length === 'string') ? parseInt(fieldConfig.length) : fieldConfig.length;
        outObj[key] = rawValue.slice(index + offset, index + offset + length);
        return outObj;
    }
    if (fieldConfig.amount) {
        const amountStr = (typeof rawValue === 'number') ? rawValue.toString() : rawValue;
        const thousands = (decimal === ',') ? '.' : ',';
        const needsFix = (amountStr.slice(-3).indexOf(thousands) !== -1 || amountStr.slice(0, -3).indexOf(decimal) !== -1);
        const outValue = (needsFix) ? amountStr.replace(decimal, '').replace(thousands, decimal) : amountStr;
        outObj[key] = outValue;
        return outObj;
    }
    if (fieldConfig.fromManual) {
        if (!fieldConfig.key || !manualFields[fieldConfig.key]) throw new Error('invalid fromManual config');
        outObj[key] = manualFields[fieldConfig.key];
        return outObj;
    }
}

const makeFirstLast = (config, csvArr) => {
    const headers = csvArr[0];
    var outObj = {};
    for (const key in config) {
        if (config.hasOwnProperty(key)) {
            const fieldConfig = config[key];
            if (fieldConfig.last || fieldConfig.first) {
                const rowIndex = (fieldConfig.first) ? 1 : csvArr.length - 1;
                if (!fieldConfig.field) throw new Error('invalid first/last config');
                const index = headers.indexOf(fieldConfig.field);
                if (index === -1) throw new Error('invalid first/last config');
                outObj[key] = csvArr[rowIndex][index];
            }
        }
    }
    return outObj;
}


// very basic helpers
const initCaps = (str) => {
    return str.toLowerCase().replace(/(?:^|[\s,\-,\/])[a-z]|[a-z]+(?:[0-9])|(?:[0-9])[a-z]+/g, function (m) {
        return m.toUpperCase();
    });
}

const getDate = (str, format) => {
    const yI = format.indexOf('yyyy');
    const mI = format.indexOf('mm');
    const dI = format.indexOf('dd');
    if (yI < 0 || mI < 0 || dI < 0) throw new Error('invalid date format');
    return {
        y: str.slice(yI, yI + 4),
        m: str.slice(mI, mI + 2),
        d: str.slice(dI, dI + 2)
    }
}

const putDate = ({ y, m, d }, format) => {
    return format
        .replace('yyyy', y)
        .replace('mm', m)
        .replace('dd', d);
}

const objFromArr = (arr) => {
    var outObj = Object.assign({}, ['', ...arr])
    delete outObj['0'];
    return outObj;
}

exports.makeDetails = makeDetails;
exports.objFromArr = objFromArr;
exports.makeManual = makeManual;
exports.makeFirstLast = makeFirstLast;