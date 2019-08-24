const requiredDetails = ['date', 'message', 'amount'];

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
    let errors = [];
    for (const reqDetail of requiredDetails) {
        if (!checkField(config.details[reqDetail])) errors.push({ field: reqDetail, error: 'verplicht csv bronveld ontbreekt' })
    }
    return errors;
}

exports.emptyMapping = {
    "financial_account_id": { "system": true }, // system generated, = account id from request path
    "reference": { "system": true }, // system generated = filename (without extension)
    "official_date": { "system" : true, "formatFrom": "dd/mm/yyyy", "formatTo": "yyyy-mm-dd" }, // creation date
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