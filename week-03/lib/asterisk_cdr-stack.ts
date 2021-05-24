import * as ec2 from "@aws-cdk/aws-ec2";
import * as cdk from '@aws-cdk/core';
import { KeyPair } from 'cdk-ec2-key-pair';
import { Asset } from '@aws-cdk/aws-s3-assets';
import * as path from 'path';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import { CustomResource, Duration } from '@aws-cdk/core';
import lambda = require('@aws-cdk/aws-lambda');
import custom = require('@aws-cdk/custom-resources')
import dynamodb = require('@aws-cdk/aws-dynamodb');
import s3 = require('@aws-cdk/aws-s3');
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';

export interface StackProps {
  SecurityGroupIP: string;
}
export class AsteriskCdrStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id);

    const cdrTable = new dynamodb.Table(this, 'meetings', {
      partitionKey: {
        name: 'callId',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,            
    });

    const cdrBucket = new s3.Bucket(this, 'cdrBucket', {
    });

    const processCDRsLambda = new lambda.Function(this, 'process', {
      code: lambda.Code.fromAsset("src", {exclude: ["**", "!process.js"]}),
      handler: 'process.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: Duration.seconds(60),
      role: new iam.Role(this, 'lambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [ 
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AWSPriceListServiceFullAccess")]
        }),
      environment: {
        CDR_TABLE: cdrTable.tableName
      },
    });

    processCDRsLambda.addEventSource(new S3EventSource(cdrBucket, {
      events: [ s3.EventType.OBJECT_CREATED]
    }));

    cdrTable.grantReadWriteData(processCDRsLambda)
    cdrBucket.grantRead(processCDRsLambda)


    // Create a Key Pair to be used with this EC2 Instance
    const key = new KeyPair(this, 'KeyPair', {
      name: 'cdk-keypair',
      description: 'Key Pair created with CDK Deployment',
    });
    key.grantReadOnPublicKey
    
    // Create new VPC with 2 Subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [ {
        cidrMask: 24,
        name: "asterisk",
        subnetType: ec2.SubnetType.PUBLIC
    }]});

    // Allow SSH (TCP Port 22) access from anywhere
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Security Group for Asterisk Server',
      allowAllOutbound: true 
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.udp(5060), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.tcp(5060), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.tcp(5061), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.udp(5060), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.tcp(5060), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.tcp(5061), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.udpRange(5000,65000), 'Allow Chime Voice Connector Signaling Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.udpRange(5000,65000), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.udpRange(5000,65000), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('52.55.62.128/25'), ec2.Port.udpRange(1024,65535), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('52.55.63.0/25'), ec2.Port.udpRange(1024,65535), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('34.212.95.128/25'), ec2.Port.udpRange(1024,65535), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4('34.223.21.0/25'), ec2.Port.udpRange(1024,65535), 'Allow Chime Voice Connector Media Access')
    securityGroup.addIngressRule(ec2.Peer.ipv4(props.SecurityGroupIP + '/32'), ec2.Port.allTraffic(), 'All inbound traffic from local machine')

    const role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))
    
    const eip = new ec2.CfnEIP(this, 'EIP')

    // Use Latest Amazon Linux Image - CPU Type ARM64
    const ami = new ec2.AmazonLinuxImage({ 
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64});

    const createVoiceConnectorRole = new iam.Role(this, 'createChimeLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
          resources: ['*'],
          actions: ['chime:*',
                    'lambda:*']})]})
      },
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
    })
    
    const createVoiceConnectorLambda = new lambda.Function(this, 'createVCLambda', {
      code: lambda.Code.fromAsset("src", {exclude: ["**", "!createVoiceConnector.py"]}),
      handler: 'createVoiceConnector.on_event',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: createVoiceConnectorRole,
      timeout: Duration.seconds(60)
    });

    const voiceConnectorProvider = new custom.Provider(this, 'voiceConnectorProvider', {
      onEventHandler: createVoiceConnectorLambda
    })

    const voiceConnectorResource = new CustomResource(this, 'voiceConnectorResource', { 
      serviceToken: voiceConnectorProvider.serviceToken,
      properties: { 'region': this.region,
                    'eip': eip.ref }
    })

    const phoneNumber = voiceConnectorResource.getAttString('phoneNumber')    
    const voiceConnectorId = voiceConnectorResource.getAttString('voiceConnectorId')
    const outboundHostName = voiceConnectorResource.getAttString('outboundHostName')

    const phoneNumberParameter = new ssm.StringParameter(this, 'phoneNumber', {
      parameterName: '/asterisk/phoneNumber',
      stringValue: phoneNumber,
    });

    const voiceConnectorParameter = new ssm.StringParameter(this, 'voiceConnector', {
      parameterName: '/asterisk/voiceConnector',
      stringValue: voiceConnectorId
    })

    const outboundHostNameParameter = new ssm.StringParameter(this, 'outboundHostName', {
      parameterName: '/asterisk/outboundHostName',
      stringValue: outboundHostName
    })

    const ec2UserData = ec2.UserData.forLinux();

    const asteriskConfig = new Asset(this, 'AsteriskConfig', {path: path.join(__dirname, '../src/config.sh')});
    
    const configPath = ec2UserData.addS3DownloadCommand({
      bucket:asteriskConfig.bucket,
      bucketKey:asteriskConfig.s3ObjectKey,
    });

    ec2UserData.addExecuteFileCommand({
      filePath:configPath,
      arguments: '--verbose -y'
    });

    asteriskConfig.grantRead(role);
    phoneNumberParameter.grantRead(role);
    voiceConnectorParameter.grantRead(role);
    outboundHostNameParameter.grantRead(role);

    // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.LARGE),
      machineImage: ami,
      securityGroup: securityGroup,
      keyName: key.keyPairName,
      role: role,
      userData: ec2UserData,
    });

    new ec2.CfnEIPAssociation(this, "EIP Association", {
      eip: eip.ref,
      instanceId: ec2Instance.instanceId
    })


    // Create outputs for connecting
    new cdk.CfnOutput(this, 'IP Address', { value: ec2Instance.instancePublicIp });
    new cdk.CfnOutput(this, 'Download Key Command', { value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem' })
    new cdk.CfnOutput(this, 'ssh command', { value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + ec2Instance.instancePublicIp })
    new cdk.CfnOutput(this, 'PhoneNumber', { value: phoneNumber}),
    new cdk.CfnOutput(this, 'VoiceConnector', { value: outboundHostName})
    new cdk.CfnOutput(this, 'VoiceConnectorLogs', { value: '/aws/ChimeVoiceConnectorLogs/' + voiceConnectorId})
    new cdk.CfnOutput(this, 'VoiceConnectorSipMessages', { value: '/aws/ChimeVoiceConnectorSipMessages/' + voiceConnectorId})
    new cdk.CfnOutput(this, 'Update Security Group', { value: 'aws ec2 authorize-security-group-ingress --group-id ' + securityGroup.securityGroupId + ' --protocol -1 --cidr YOUR_PUBLIC_IP/32'})
  }
}