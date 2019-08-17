# Serverless function mb-bankmutations
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
        "reference": { "manual" : true },
        "official_date": { "manual" : true, "formatFrom": "dd/mm/yyyy", "formatTo": "yyyy-mm-dd" },
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
    * If the file does not (yet) exist, a generic json file without mappings will be returned
    * Error response if account id is not a valid Moneybird account id
* `POST /config/[account id]` to create/update mappings
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    * request body must contain valid json with new mapping
    * required fields (could be null, but should be included) are
        * in main body: `reference, official_date, details`
        * in details: `date, valutation_date, message, amount`
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
    * body must contain:
    ```json
    {
        "csv_filename": "KBC1213 201907.csv",
        "csv_content": "datum; valuta; ...\n20190708; EUR;...",
        "config": "bank-config-[account id].json",
        "reference": "KBCSCKS",
        "official_date": "2019-07-27"
    }
    ```
    * returns a json file with converted lines from csv file

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

* `DELETE` only valid with filename, body should have { filename } too.

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
    * with response from moneybird, will update `'[account]/summary-account id.json` too, with the date sent, send result and (if OK) the moneybird ID of the statement.
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
