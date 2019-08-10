const requiredFields = ['reference', 'official_date'];
const requiredDetails = ['date', 'valutation_date', 'message', 'amount'];

const checkField = (field) => {
    return (field &&
        (
            (typeof field === 'string') ||
            (typeof field === 'object' && 
                (field.hasOwnProperty('field') || (field.hasOwnProperty('manual') && field.manual))
            ) ||
            (Array.isArray(field) && field.length > 0 && typeof field[0] === 'string')
        ));
}

exports.validate = (config) => {
    var failedList = [];
    for (let i = 0; i < requiredFields.length; i++) {
        const reqField = requiredFields[i];
        if (!checkField(config[reqField])) failedList.push(reqField);
    }
    if (config.details) {
        for (let i = 0; i < requiredDetails.length; i++) {
            const reqDetail = requiredDetails[i];
            if (!checkField(config.details[reqDetail])) failedList.push(reqDetail)
        }
        for (key in config.details) {
            if (config.details[key] && !typeof config.details[key] === 'string' && !config.details[key].field) {
                failedList.push(key)
            }
        }
    } else failedList.push('Details')
    return [...new Set(failedList)];
}

exports.emptyMapping = {
    "financial_account_id": { "system": true }, // system generated, = account id from request path
    "reference": { "manual": true }, // manually set by user
    "official_date": { "manual": true, "format": "yyyy-mm-dd" }, // manually set by user
    "official_balance": null,
    "details": {
        "date": null,
        "valutation_date": null,
        "message": null,
        "amount": null,
        "code": null,
        "contra_account_name": null,
        "contra_account_number": null,
        "batch_reference": null,
        "offset": null,
        "account_servicer_transaction_id": null
    },
    "separator": ";",
    "decimal": ",",
    "unmapped": []
}