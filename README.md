# Serverless function mb-bankmutations
![made for aws](https://img.shields.io/badge/made%20for-AWS-blue)

An AWS serverless application, that provides endpoints for sending .csv files with bank account mutations to Moneybird.
Specifically for KBC, because their MT940 output s*cks, and the only decent export from KBC is in .csv format.

## Endpoints

`/config` to get or set mappings for csv files to Moneybird financial statements
* `GET /config/[account id]` get configuration for a bank account from Moneybird
    * `[account id]` must be a valid Moneybird account id
    * returns a json file
    ```json
    {
        "financial_account_id": { "system": true },
        "reference": { "system" : true },
        "paypal_special": false,
        "official_date": { "system" : true, "formatFrom": "dd/mm/yyyy", "formatTo": "yyyy-mm-dd" },
        "official_balance": { "field": "Saldo", "last": true },
        "details": {
            "date": { "field": "Datum", "formatFrom": "dd/mm/yyyy", "formatTo": "yyyy-mm-dd" },
            "valutation_date": "Valuta",
            "message": { "field": [ "Tegenpartij", "Omschrijving" ], "beautify": true },
            "amount": { "field": "Bedrag", "amount": true },
            "code": null,
            "contra_account_name": "naam tegenrekening",
            "contra_account_number": "tegenrekening",
            "batch_reference": { "field": "Omschrijving", "match": "Moneybird", "offset": 10, "length": 12 },
            "offset": null,
            "account_servicer_transaction_id": null
        },
        "separator": ";",
        "decimal": ",",
        "unmapped": [ "credit", "debet" ],
        "validated": true
    }
    ```
    * If the file does not (yet) exist, a default json file without mappings will be returned
    * Error response if account id is not a valid Moneybird account id
* `POST /config/[account id]` to create/update mappings
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    * request body must contain valid json with new mapping
    * required fields (could be null, but should be included) are
        * in details: `date, message, amount`
    * saves the json file in the private bucket
    * returns the validation of the config (a json list of required field not yet mapped)
    ```json
    [ "valutation_date", "amount" ]
    ```
* `PATCH /config/[account id]` updates one or more fields in an existing config file
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    * request body must contain valid json with (partial) new mappings
        * updates can be nested, e.g. to change only one field in details, or only 1 setting in formatted settings
    * saves the json file in the private bucket
    * returns the validation of the new config file
    * if the original json did not exist, will return an error

`/convert` to convert a csv text file to a Moneybird-readable json file
* `POST /convert/[account id]`
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    * body structure is:
    ```json
    {
        "csv_filename": "KBC1213 201907.csv",
        "csv_content": "...(csv string)...",
        "convert_only": false
    }
    ```
    * if `csv_content` is provided, the csv file will saved. Without `csv_content`, the csv file needs to exist already.
    * if the related config file does not yet exist, the default config will be used (but will produce error, since default does not contain mappings)
    * with the config, a conversion will be attempted. If successful, 
        * resulting json will be saved
        * the resulting json will be sent to moneybird (unless flag convert_only is set)
        * results from moneybird will be saved (validation of config + record of submission to moneybird)
        * if results from moneybird are OK, json-file of converted csv will be returned in response (otherwise error)
    * error message structure (strings contain possible errors, fields only if there are errors) for response:
    ```json
    { "errors": {
        "csv_read_errors": [ "bestandsnaam is niet .csv", "bestand bevat geen (leesbare) regels", "kan regels niet lezen"],
        "field_errors": [
            { "field": "date", "errors": [
                "verplicht csv bronveld ontbreekt",
                "veld ... niet gevonden in csv",
                "ongeldig datum-formaat"] 
            },
            { "field": "message", "errors": ["verplicht csv bronveld ontbreekt", "veld ... niet gevonden in csv"] },
            { "field": "amount", "errors": [
                "verplicht csv bronveld ontbreekt", 
                "veld ... niet gevonden in csv", 
                "csv veld bevat geen bedrag" ]}
            { "field": "valutation_date", "errors": ["veld ... niet gevonden in csv", "ongeldig datum-formaat"] },
            { "field": "code | contra_account_name | contra_account_number | account_servicer_transaction_id", 
                "errors": ["veld ... niet gevonden in csv"]},
            { "field": "official_balance", "errors": ["veld ... niet gevonden in csv", "csv veld bevat geen bedrag"] }
        ],
        "moneybird_error": "(message from moneybird)"
    }}
    ```

`/files/[account id][/filename]` file management for converted files/ valid json files, in public bucket
* `GET` with filename returns file, without filename will return list of file summaries, in json format
    ```json
    [
        { 
            "filename": "[something]",
            "last_modified": { "csv": "[date]", "json": "[date]" },
            "last_sent": "20190802",
            "send_result_ok": true,
            "id": "123456"
        }
    ]
    ```
* `POST` only valid with filename, needs body with file too (duh)
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    * body needs to be string to save (could be stringified json)

* `DELETE` only valid with filename, body should have { filename } too. (filename without path)

`/send`to send a file to moneybird
* `POST send/[account id]`
    * needs auth Bearer token in header and json in body
    * `[account id]` must be valid (will be checked)
    ```json
    {
        "filename": "...",
        "json": "{ ... }"
    }
    ```
    * with response from moneybird, will update `[account]/summary-account id.json` too, with the date sent, send result and (if OK) the moneybird ID of the statement.
    * returns the new summaries list (see `GET files/[account]`)


---
# Inner workings

In the private bucket, a folder is made for each account id. In these folders:
* a config files is stored, with name format `bank-config-[account id].json`.
* a summary file is stored, with the name `summary-[account id].json`, with the following structure:
    ```json
    [
        { 
            "filename": "[something].json",
            "last_sent": "20190802",
            "send_result_ok": true,
            "id": "123456"
        }
    ]
    ```
