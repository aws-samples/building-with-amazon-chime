# Chime Voice Connector with Faxing Demo

This demo will build and configure several services and servers within AWS to receive and process a fax.  

## Requirements
- AWS CLI [installed](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html)
- node/npm [installed](https://github.com/nodesource/distributions/blob/master/README.md)
- AWS CDK [installed](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) and [bootstrapped](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html)
- Ability to create a VPC and EIP within that VPC (ensure your [Service Quota](https://console.aws.amazon.com/servicequotas/) for EIP is not reached)
- Ability to create a Chime Voice Connector (ensure your Service Quota for VC is not reached)
## Deployment

- Clone this repo
- `chmod +x deploy.sh`
- `./deploy.sh`

This script will ensure that all dependencies are installed and ready for the CDK deployment.  If you get a schema related error, please uninstall and re-install aws-cdk to get to the latest version.  
```
npm uninstall -g aws-cdk
npm install -g aws-cdk
```
## Connecting to the Asterisk Server

The output of the CDK will include several commands that you will use to connect to your Asterisk server.  There is no requirement to connect to the Asterisk server, but may be of interest.  

The CDK will create a key-pair and store the private key in AWS SecretsManager.  The DownloadKeyCommand will download this file to your local machine.  The public key of this key-pair has already been loaded in the Asterisk server.  The sshcommand will then ssh to your Asterisk server.

## Overview
![Week-02-Overview](/images/Week-02-Diagram-Overview.png)
## Changes from Previous Asterisk

In the previous demo, we created a simple Asterisk server to be used to make phone calls to the PSTN.  In this demo, we'll be using many of the same components but making some changes to the Asterisk configuration and adding some new components.

```
yum install inotify-tools -y
yum install ImageMagick ImageMagick-devel -y
wget https://www.soft-switch.org/downloads/spandsp/spandsp-0.0.6.tar.gz
```

In the config.sh deployment script, these three parts were added.  
- [inotify-tools](https://github.com/inotify-tools/inotify-tools) is used to monitor a directory for changes.  This will be used to monitor for new fax images and upload them to S3 when they arrive
- [ImageMagick](https://imagemagick.org/index.php) is used to convert the .tif file output from the Asterisk server to a .jpg file that can be processed by Amazon Textract
- [spandsp](https://github.com/freeswitch/spandsp) is the library used by Asterisk to process the faxes
  
These additions are combined to create a server that will recieve a fax, save the fax to a directory, convert the file, and then upload the file to S3.  From there, other services will take over to complete the processing of the fax.

```
[faxnumber]
exten => $PhoneNumber,1,NoOp(Receiving Fax)
same => n,Set(FAXDIRECTORY=/etc/asterisk/incoming_faxes)
same => n,Set(FAXNAME=\${STRFTIME(,,%s)})
same => n,ReceiveFax(\${FAXDIRECTORY}/\${FAXNAME}.tif)
same => n,NoOp(Fax Finished: \${FAXSTATUS})
```

In the `extensions.conf` file, these lines will answer the inbound call and save the file to the `/etc/asterisk/incoming_faxes` directory as a .tif file with the filename of the epoch seconds.  

```
	inotifywait /etc/asterisk/incoming_faxes -e moved_to -e close -e close_write --format '%f' | while read file; do
		filename=\"\${file%.*}\"
		convert /etc/asterisk/incoming_faxes/\$filename.tif /etc/asterisk/converted_faxes/\$filename.jpg
		aws s3 cp /etc/asterisk/converted_faxes/\$filename.jpg s3://$IncomingFaxBucket
	done
```

This script will monitor that directory, convert the file from a .tif to a .jpg and then upload it to an S3 bucket.

### Sending a Fax

While not covered in this demo, the Asterisk server has also been configured to send a fax from the Asterisk console:

```
asterisk -crvvvvvv
channel originate LOCAL/<FAX_NUMBER_TO_SENDTO>@outboundfax extension s@sendfax
```

This will send a fax to the number you replace <FAX_NUMBER_TO_SENDTO> with from the file `/tmp/faxfile.tif`.  

## Processing the Fax on AWS

Once the image of the fax has been uploaded to an S3 bucket, it must still be processed.  This is done by using a [Lambda function](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html).  When the file is uploaded to S3, the Lambda is automatically [triggered](https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html).  

When this happens, the Lambda will make a request to [Amazon Textract](https://aws.amazon.com/textract/) with this code:

```
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    client = boto3.client('textract')

    #process using S3 object
    response = client.detect_document_text(
        Document={'S3Object': {'Bucket': bucket, 'Name': key}})
```

The output from this request can be seen in the [CloudWatch](https://aws.amazon.com/cloudwatch/) logs but could easily be used with other services as needed.
# Destroying This Install

To clean up after you're done with this demo, you can run `cdk destroy`.  This will remove most of the components that were created, but you will need to remove the Voice Connector and Phone Number associated manually within the AWS [Chime Console](https://console.chime.aws.amazon.com/).


