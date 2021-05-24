
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
var docClient = new AWS.DynamoDB.DocumentClient();
const cdrTable = process.env.CDR_TABLE

async function downloadCDR(event) {
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    try {
        const params = {
            Bucket: srcBucket,
            Key: srcKey
        };
        var callDetailRecord = await s3.getObject(params).promise();
    } catch (error) {
        console.log(error);
    }
    return callDetailRecord;
}

async function uploadCDR(callDetailRecord, priceComponents) {
    const parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());
    console.log(parsedCallDetailRecord)
    console.log(priceComponents)
    var params = {
        TableName: cdrTable,
        Item: {
            "callId": parsedCallDetailRecord.CallId,
            "transactionId": parsedCallDetailRecord.TransactionId,
            "AwsAccountId": parsedCallDetailRecord.AwsAccountId,
            "voiceConectorId": parsedCallDetailRecord.VoiceConnectorId,
            "status": parsedCallDetailRecord.Status,
            "StatusMessage": parsedCallDetailRecord.StatusMessage,
            "BillableDurationSeconds": parsedCallDetailRecord.BillableDurationSeconds,
            "DestinationPhoneNumber": parsedCallDetailRecord.DestinationPhoneNumber,
            "DestinationCountry": parsedCallDetailRecord.DestinationCountry,
            "SourcePhoneNumber": parsedCallDetailRecord.SourcePhoneNumber,
            "SourceCountry": parsedCallDetailRecord.SourceCountry,
            "UsageType": parsedCallDetailRecord.UsageType,
            "ServiceCode": parsedCallDetailRecord.ServiceCode,
            "Direction": parsedCallDetailRecord.Direction,
            "StartTimeEpochSeconds": parsedCallDetailRecord.StartTimeEpochSeconds,
            "EndTimeEpochSeconds": parsedCallDetailRecord.EndTimeEpochSeconds,
            "Region": parsedCallDetailRecord.Region,
            "Streaming": parsedCallDetailRecord.Streaming,
            "callCost": priceComponents.callCost,
            "pricePerMinute": priceComponents.pricePerMinute,
            "currency": priceComponents.currency
        }
    }
    console.log(params)
    try {
        await docClient.put(params).promise()
        console.log("Inserted CDR")
    } catch (err) {
        console.log(err)
        return err
    }
}

async function getPrices(callDetailRecord) {
    var parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());
    var params = {
        Filters: [
            {
                Field: "ServiceCode",
                Type: "TERM_MATCH",
                Value: "AmazonChimeVoiceConnector"
            },
            {
                Field: "usagetype",
                Type: "TERM_MATCH",
                Value: parsedCallDetailRecord.UsageType
            }
        ],
        MaxResults: 1,
        ServiceCode: "AmazonChimeVoiceConnector"
    };
    var pricing = new AWS.Pricing({
        apiVersion: '2017-10-15',
        region: 'us-east-1',
    }).getProducts(params);
    
    var promise = pricing.promise();
    
    promise.then(
        function(data) {
            return data;
        },
        function(error) {
            console.log(error);
        }
    );
    return promise;
}

exports.handler = async function(event, context, callback) {
    console.log(event)
    const callDetailRecord = await downloadCDR(event);
    const pricing = await getPrices(callDetailRecord);
    console.log("main pricing: ", pricing);

    var parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());    
    var sku = Object.keys(pricing.PriceList[0].terms.OnDemand);
    var rateCode = Object.keys(pricing.PriceList[0].terms.OnDemand[sku].priceDimensions);
    var currency = Object.keys(pricing.PriceList[0].terms.OnDemand[sku].priceDimensions[rateCode].pricePerUnit);
    var pricePerMinute = pricing.PriceList[0].terms.OnDemand[sku].priceDimensions[rateCode].pricePerUnit[currency];
    const callCost = pricePerMinute * parsedCallDetailRecord.BillableDurationSeconds;
    var priceComponents = {"currency": currency, "pricePerMinute": pricePerMinute, "callCost": callCost};
    console.log("priceComponents: ", priceComponents);      

    const uploadStatus = await uploadCDR(callDetailRecord, priceComponents);
    return uploadStatus;
};