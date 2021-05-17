import json
import urllib.parse
import boto3

def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    client = boto3.client('textract')

    #process using S3 object
    response = client.detect_document_text(
        Document={'S3Object': {'Bucket': bucket, 'Name': key}})

    #Get the text blocks
    blocks=response['Blocks']

    for item in response["Blocks"]:
        if item["BlockType"] == "LINE":
            print (item["Text"])
        
    return {
        'statusCode': 200,
        'body': json.dumps(blocks)
    }                
            