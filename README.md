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
        "financial_account_id": { "system": true }, // system generated, = account id from request path
        "reference": { "manual" : true }, // manually set by user
        "official_date": { "manual" : true, "format": "yyyy-mm-dd" }, // manually set by user
        "official_balance": { "field": "Saldo", "last": true }, // take value from last detail line
        "details": {
            "date": { "field": "Datum", "formatFrom": "dd/mm/yyyy", "formatTo": "yyyy-mm-dd" }, // simple mapping
            "valutation_date": "Valuta", // can be string too
            "message": { "field": [ "Tegenpartij", "Omschrijving" ], "beautify": true }, // combine multiple cells
            "amount": { "field": "Bedrag", "amount": true },
            "code": null, // unassigned
            "contra_account_name": "naam tegenrekening",
            "contra_account_number": "tegenrekening",
            "batch_reference": { "field": "Omschrijving", "match": "Moneybird", "offset": 10, "length": 12 }, // default
            "offset": null,
            "account_servicer_transaction_id": null
        },
        "separator": ";",
        "decimal": ",",
        "unmapped": [ "credit", "debet" ],  // fields from csv which are not mapped
        "validated": true // if a conversion with this config went OK`
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
        "csv_filename": "KBC1213 201907.csv", // name of csv file to convert
        "csv_content": "datum; valuta; ...\n20190708; EUR;...", // the csv file
        "config": "bank-config-[account id].json", // valid config filename
        "reference": "KBCSCKS", // must include all manual fields from config
        "official_date": "2019-07-27"
    }
    ```
    * returns a json file with converted lines from csv file

`/files/[account id][/filename]` file management for converted files/ valid json files, in public bucket
* `GET` with filename returns file, without filename will return list of file summaries, in json format
    ```json
    [
        { 
            "filename": "[something].json", // the name used to save the file
            "last_modified": "[date]",
            "last_sent": "20190802", // will be null if never sent
            "send_result_ok": true, // if Moneybird response was OK
            "id": "123456" // moneybird id of the financial statement (to link to)
        }
    ]
    ```
* `POST` only valid with filename, needs body with file too (duh)
    * `[account id]` must be a valid Moneybird account id (is checked)
    * request header must contain auth Bearer token
    ```json
    {
        "filename": "KBC1213 201907.json", // filename under which to save
        "json": "[ ... ]" // the json file (stringified) to save
    }
    ```
* `DELETE` only valid with filename, body should have { filename } too.

`/send`to send a file to moneybird
* `POST send/[account id]`
    * needs auth Bearer token in header and json in body
    * `[account id]` must be valid (will be checked)
    ```json
    {
        "filename": "...", // if filled will try and get filename from S3 to send to moneybird
        "json": "{ ... }" // the json body (stringified) to send to Moneybird (only if no filename)
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
            "filename": "[something].json", // the name used to save the file
            "last_modified": "[date]",
            "last_sent": "20190802", // will be null if never sent
            "send_result_ok": true, // if Moneybird response was OK
            "id": "123456" // moneybird id of the financial statement (to link to)
        }
    ]
    ```

---
# SAM INSTRUCTIONS GENERIC
This is a sample template for mb-bankmutations - Below is a brief explanation of what we have generated for you:

```bash
.
├── README.MD                   <-- This instructions file
├── event.json                  <-- API Gateway Proxy Integration event payload
├── hello-world                 <-- Source code for a lambda function
│   └── app.js                  <-- Lambda function code
│   └── package.json            <-- NodeJS dependencies and scripts
│   └── tests                   <-- Unit tests
│       └── unit
│           └── test-handler.js
├── template.yaml               <-- SAM template
```

## Requirements

* AWS CLI already configured with Administrator permission
* [NodeJS 10.10+ installed](https://nodejs.org/en/download/releases/)

* [Docker installed](https://www.docker.com/community-edition)

## Setup process

### Local development

**Invoking function locally using a local sample payload**

```bash
sam local invoke HelloWorldFunction --event event.json
```
 
**Invoking function locally through local API Gateway**

```bash
sam local start-api
```

If the previous command ran successfully you should now be able to hit the following local endpoint to invoke your function `http://localhost:3000/hello`

**SAM CLI** is used to emulate both Lambda and API Gateway locally and uses our `template.yaml` to understand how to bootstrap this environment (runtime, where the source code is, etc.) - The following excerpt is what the CLI will read in order to initialize an API and its routes:

```yaml
...
Events:
    HelloWorld:
        Type: Api # More info about API Event Source: https://github.com/awslabs/serverless-application-model/blob/master/versions/2016-10-31.md#api
        Properties:
            Path: /hello
            Method: get
```

## Packaging and deployment

AWS Lambda NodeJS runtime requires a flat folder with all dependencies including the application. SAM will use `CodeUri` property to know where to look up for both application and dependencies:

```yaml
...
    HelloWorldFunction:
        Type: AWS::Serverless::Function
        Properties:
            CodeUri: hello-world/
            ...
```

Firstly, we need a `S3 bucket` where we can upload our Lambda functions packaged as ZIP before we deploy anything - If you don't have a S3 bucket to store code artifacts then this is a good time to create one:

```bash
aws s3 mb s3://BUCKET_NAME
```

Next, run the following command to package our Lambda function to S3:

```bash
sam package \
    --output-template-file packaged.yaml \
    --s3-bucket REPLACE_THIS_WITH_YOUR_S3_BUCKET_NAME
```

Next, the following command will create a Cloudformation Stack and deploy your SAM resources.

```bash
sam deploy \
    --template-file packaged.yaml \
    --stack-name mb-bankmutations \
    --capabilities CAPABILITY_IAM
```

> **See [Serverless Application Model (SAM) HOWTO Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-quick-start.html) for more details in how to get started.**

After deployment is complete you can run the following command to retrieve the API Gateway Endpoint URL:

```bash
aws cloudformation describe-stacks \
    --stack-name mb-bankmutations \
    --query 'Stacks[].Outputs[?OutputKey==`HelloWorldApi`]' \
    --output table
``` 

## Fetch, tail, and filter Lambda function logs

To simplify troubleshooting, SAM CLI has a command called sam logs. sam logs lets you fetch logs generated by your Lambda function from the command line. In addition to printing the logs on the terminal, this command has several nifty features to help you quickly find the bug.

`NOTE`: This command works for all AWS Lambda functions; not just the ones you deploy using SAM.

```bash
sam logs -n HelloWorldFunction --stack-name mb-bankmutations --tail
```

You can find more information and examples about filtering Lambda function logs in the [SAM CLI Documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-logging.html).

## Testing

We use `mocha` for testing our code and it is already added in `package.json` under `scripts`, so that we can simply run the following command to run our tests:

```bash
cd hello-world
npm install
npm run test
```

## Cleanup

In order to delete our Serverless Application recently deployed you can use the following AWS CLI Command:

```bash
aws cloudformation delete-stack --stack-name mb-bankmutations
```

## Bringing to the next level

Here are a few things you can try to get more acquainted with building serverless applications using SAM:

### Learn how SAM Build can help you with dependencies

* Uncomment lines on `app.js`
* Build the project with ``sam build --use-container``
* Invoke with ``sam local invoke HelloWorldFunction --event event.json``
* Update tests

### Create an additional API resource

* Create a catch all resource (e.g. /hello/{proxy+}) and return the name requested through this new path
* Update tests

### Step-through debugging

* **[Enable step-through debugging docs for supported runtimes]((https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-debugging.html))**

Next, you can use AWS Serverless Application Repository to deploy ready to use Apps that go beyond hello world samples and learn how authors developed their applications: [AWS Serverless Application Repository main page](https://aws.amazon.com/serverless/serverlessrepo/)

# Appendix

## Building the project

[AWS Lambda requires a flat folder](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-create-deployment-pkg.html) with the application as well as its dependencies in a node_modules folder. When you make changes to your source code or dependency manifest,
run the following command to build your project local testing and deployment:

```bash
sam build
```

If your dependencies contain native modules that need to be compiled specifically for the operating system running on AWS Lambda, use this command to build inside a Lambda-like Docker container instead:
```bash
sam build --use-container
```

By default, this command writes built artifacts to `.aws-sam/build` folder.

## SAM and AWS CLI commands

All commands used throughout this document

```bash
# Invoke function locally with event.json as an input
sam local invoke HelloWorldFunction --event event.json

# Run API Gateway locally
sam local start-api

# Create S3 bucket
aws s3 mb s3://BUCKET_NAME

# Package Lambda function defined locally and upload to S3 as an artifact
sam package \
    --output-template-file packaged.yaml \
    --s3-bucket REPLACE_THIS_WITH_YOUR_S3_BUCKET_NAME

# Deploy SAM template as a CloudFormation stack
sam deploy \
    --template-file packaged.yaml \
    --stack-name mb-bankmutations \
    --capabilities CAPABILITY_IAM

# Describe Output section of CloudFormation stack previously created
aws cloudformation describe-stacks \
    --stack-name mb-bankmutations \
    --query 'Stacks[].Outputs[?OutputKey==`HelloWorldApi`]' \
    --output table

# Tail Lambda function Logs using Logical name defined in SAM Template
sam logs -n HelloWorldFunction --stack-name mb-bankmutations --tail
```

**NOTE**: Alternatively this could be part of package.json scripts section.
