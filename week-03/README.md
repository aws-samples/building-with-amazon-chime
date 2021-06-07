# Chime Voice Connector Troubleshooting

This demo will build and configure several services to explore troubleshooting VoIP on AWS.

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

![Diagram](images/Week-03-Diagram.png)

### Logging in to Server
This week we'll be exploring trouble shooting on the Asterisk so logging on will be more useful than in pervious weeks.

-   ssh to Asterisk: `ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@<YOUR_SERVER_IP>`
-   get access to root: `sudo bash`
-   check to see if config completed: `tail -f /var/log/cloud-init-output.log`

You should see something like:
```
chown -R asterisk.asterisk /var/lib/asterisk /var/log/asterisk /var/spool/asterisk systemctl start asterisk
```

### Capturing traffic

-   install Wireshark: `yum install wireshark -y`
-   capture SIP messages to screen: `tshark -f "udp port 5060"`
-   capture SIP messages to file: `tshark -f "udp port 5060" -w /tmp/capture.pcap`
-   capture SIP messages and audio to file: `tshark -f "udp" -w /tmp/capture.pcap`

### Transfering pcap to local machine
-   change ownership of file to ec2-user: `chown ec2-user /tmp/capture.pcap`
-   copy file down to local machine: `scp -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@<YOUR_SERVER_IP>:/tmp/capture.pcap ./`

# Destroying This Install

To clean up after you're done with this demo, you can run `cdk destroy`.  This will remove most of the components that were created, but you will need to remove the Voice Connector and Phone Number associated manually within the AWS [Chime Console](https://console.chime.aws.amazon.com/).
