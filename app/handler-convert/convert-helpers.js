const makeDetails = (csvArr, config, systemFields, errors) => {
    const decimal = config.decimal || ',';
    const headers = csvArr[0];
    let outArr = [];
    let newErrors = errors;

    for (const csvRow of csvArr.slice(1)) {
        let outObj = {};
        for (const key in config.details) {
            const fieldConfig = config.details[key];
            if (fieldConfig) {
                let rawValue, error, newField;
                if (fieldConfig.fromSystem) {
                    if (!fieldConfig.key || !systemFields[fieldConfig.key]) throw new Error('invalid fromSystem config');
                    rawValue = systemFields[fieldConfig.key]
                } else {
                    [rawValue, error] = makeRawValue(key, fieldConfig, headers, csvRow);
                    if (error) newErrors = addFieldError(error, newErrors);
                }
                [newField, error] = makeField(key, fieldConfig, rawValue, decimal, systemFields)
                if (error) newErrors = addFieldError(error, newErrors);
                if (newField[key]) outObj = Object.assign(outObj, newField);
            }
        }
        outArr.push(outObj)
    }
    return [outArr, newErrors];
}

const makeSystemFields = (config, filename, accountID, errors) => {
    const outObj = {
        financial_account_id: accountID,
        reference: filename,
        official_date: nowDate(config.official_date.formatTo)
    };
    return [outObj, errors];
}

const makeRawValue = (key, fieldConfig, headers, csvRow) => {
    let error = null;
    const fields = (typeof fieldConfig === 'string') ? [fieldConfig]
        : (typeof fieldConfig.field === 'string') ? [fieldConfig.field]
            : (Array.isArray(fieldConfig.field)) ? fieldConfig.field : [];
    let notFoundFields = [];
    const value = fields
        .map((field) => {
            const fieldIndex = headers.indexOf(field);
            if (fieldIndex === -1) notFoundFields.push(field);
            return csvRow[fieldIndex];
        })
        .join(' - ');
    if (notFoundFields.length > 0) error = { field: key, error: `veld ${notFoundFields.join(', ')} niet gevonden in csv` };
    return [value, error];
}

const makeField = (key, fieldConfig, rawValue, decimal, systemFields) => {
    let outObj = {};
    let error = null;
    if (!rawValue || typeof fieldConfig === 'string') {
        outObj[key] = rawValue;
        return [outObj, error];
    }
    if (fieldConfig.beautify) {
        const valSingleSpace = rawValue.replace(/\"/g, '').replace(/\s\s+/g, ' ');
        outObj[key] = initCaps(valSingleSpace);
        return [outObj, error];
    }
    if (fieldConfig.formatFrom) {
        if (!fieldConfig.formatTo) throw new Error('missing formatTo');
        const ymd = getDate(rawValue, fieldConfig.formatFrom);
        const outValue = putDate(ymd, fieldConfig.formatTo);
        outObj[key] = outValue;
        return [outObj, error];
    }
    if (fieldConfig.match) {
        if (!fieldConfig.match || !fieldConfig.length || !fieldConfig.offset) throw new Error('invalid match format');
        const index = rawValue.indexOf(fieldConfig.match);
        if (index === -1) {
            outObj[key] = null;
            return [outObj, error];
        }
        const offset = (typeof fieldConfig.offset === 'string') ? parseInt(fieldConfig.offset) : fieldConfig.offset;
        const length = (typeof fieldConfig.length === 'string') ? parseInt(fieldConfig.length) : fieldConfig.length;
        outObj[key] = rawValue.slice(index + offset, index + offset + length);
        return [outObj, error];
    }
    if (fieldConfig.amount) {
        const amountStr = (typeof rawValue === 'number') ? rawValue.toString() : rawValue;
        const thousands = (decimal === ',') ? '.' : ',';
        const needsFix = (amountStr.slice(-3).indexOf(thousands) !== -1 || amountStr.slice(0, -3).indexOf(decimal) !== -1);
        const outValue = (needsFix) ? amountStr.replace(decimal, '').replace(thousands, decimal) : amountStr;
        outObj[key] = outValue;
        if (!parseFloat(outValue) && parseFloat(outValue) !== 0) {
            error = { field: key, error: `csv veld bevat geen bedrag, maar "${outValue}"` }
        }
        return [outObj, error];
    }
    if (fieldConfig.fromSystem) {
        if (!fieldConfig.key || !systemFields[fieldConfig.key]) throw new Error('invalid fromSystem config');
        outObj[key] = systemFields[fieldConfig.key];
        return [outObj, error];
    }
}

const makeFirstLast = (config, csvArr, errors) => {
    const headers = csvArr[0];
    var outObj = {};
    let newErrors = errors;
    for (const key in config) {
        if (config.hasOwnProperty(key)) {
            const fieldConfig = config[key];
            if (fieldConfig.last || fieldConfig.first) {
                const rowIndex = (fieldConfig.first) ? 1 : csvArr.length - 1;
                if (!fieldConfig.field) throw new Error('invalid first/last config');
                const index = headers.indexOf(fieldConfig.field);
                if (index === -1) {
                    const newError = { field: key, error: `veld ${fieldConfig.field} niet gevonden in csv` }
                    newErrors = addFieldError(newError, newErrors);
                }
                outObj[key] = csvArr[rowIndex][index];
            }
        }
    }

    return [outObj, newErrors];
}


// very basic helpers
const initCaps = (str) => {
    const upper = (m) => m.toUpperCase();
    return str.toLowerCase()
        .replace(/moneybird|\b([a-z]{2}[0-9]{2}(\s[a-z,0-9]{4}){1,2})\b/g, upper)
        .replace(/(?:^|[\s,\-,\/])[a-z]/g, upper);
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

const nowDate = (format) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return putDate(
        {
            y: now.getFullYear(),
            m: (month < 10) ? '0' + month : month,
            d: (day < 10) ? '0' + day : day
        }, format);
}

const objFromArr = (arr) => {
    let outObj = Object.assign({}, ['', ...arr])
    delete outObj['0'];
    return outObj;
}

// adds an error { field, value } to a list { field, [values] }
exports.addError = (newError, oldErrors) => {
    let outErrors = {};
    const newKey = Object.keys(newError)[0];
    if (!oldErrors) {
        outErrors[newKey] = [newError[newKey]]
        console.log('creating error');
    } else {
        outErrors = Object.assign({}, oldErrors.errors);
        if (oldErrors[newKey]) {
            outErrors[newKey] = [...new Set([...outErrors[newKey], newError[newKey]])]
        } else {
            outErrors[newKey] = [newError[newKey]]
        }
    }
    return { errors: outObj };
}

const addFieldError = (newFieldError, oldErrors) => {
    console.log(`field ${newFieldError.field} has error ${newFieldError.error}`);
    const newFieldErrors = { field: newFieldError.field, errors: [newFieldError.error] };
    if (!oldErrors) return { errors: { field_errors: [newFieldErrors] } };
    if (!oldErrors.errors.field_errors) {
        return { errors: Object.assign({}, oldErrors.errors, { field_errors: [newFieldErrors] }) }
    };
    let priorFieldError = false;
    let newFieldSet = oldErrors.errors.field_errors.map(item => {
        if (item.field !== newFieldError.field) return item;
        priorFieldError = true;
        return Object.assign({}, item, { errors: [...new Set([...item.errors, newFieldError.error])] })
    });
    if (!priorFieldError) newFieldSet.push(newFieldErrors);
    return { errors: Object.assign({}, oldErrors.errors, { field_errors: newFieldSet }) }
}

exports.arrayToCSV = (arr, separator) => {
    return arr.map(row => row.join(separator)).join('\n');
}
exports.makeDetails = makeDetails;
exports.objFromArr = objFromArr;
exports.makeSystemFields = makeSystemFields;
exports.makeFirstLast = makeFirstLast;
exports.addFieldError = addFieldError;