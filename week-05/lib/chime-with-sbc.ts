import * as ec2 from "@aws-cdk/aws-ec2";
import * as cdk from '@aws-cdk/core';
import { KeyPair } from 'cdk-ec2-key-pair';
import * as iam from '@aws-cdk/aws-iam';
import { CustomResource, Duration } from '@aws-cdk/core';
import lambda = require('@aws-cdk/aws-lambda');
import custom = require('@aws-cdk/custom-resources')
import { Asset } from '@aws-cdk/aws-s3-assets';
import { SubnetType } from "@aws-cdk/aws-ec2";
import * as ssm from '@aws-cdk/aws-ssm';
import * as path from 'path';

export class ChimeWithSBC extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const key = new KeyPair(this, 'KeyPair', {
      name: 'audioCode-keypair',
      description: 'Key Pair created with CDK Deployment',
    });
    key.grantReadOnPublicKey

    const sbcEip = new ec2.CfnEIP(this, 'sbcEip')
    

    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [ 
        {
        cidrMask: 24,
        name: "AudioCode",
        subnetType: ec2.SubnetType.PUBLIC
      },
    ]});

    const audioCodeSubnet = vpc.selectSubnets({subnetType: SubnetType.PUBLIC}).subnets[0];
    const asteriskSubnet = vpc.selectSubnets({subnetType: SubnetType.PUBLIC}).subnets[0];

    const privateSBCInterface = new ec2.CfnNetworkInterface(this, "privateSBCInterface", {
      subnetId: asteriskSubnet.subnetId
    });

    // const publicSBCInterface = new ec2.CfnNetworkInterface(this, 'publicSBCInterface', {
    //   subnetId: audioCodeSubnet.subnetId
    // })

    // const privateAsteriskInterface = new ec2.CfnNetworkInterface(this, "privateAsteriskInterface", {
    //   subnetId: asteriskSubnet.subnetId
    // });


    const chimeSecurityGroup = new ec2.SecurityGroup(this, 'ChimeSecurityGroup', {
      vpc,
      description: 'Security Group for Asterisk Server',
      allowAllOutbound: true 
    });

    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.udp(5060), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.tcp(5060), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.tcp(5061), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('3.80.16.0/23'), ec2.Port.udpRange(5000,65000), 'Allow Chime Voice Connector Media Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.udp(5060), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.tcp(5060), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.tcp(5061), 'Allow Chime Voice Connector Signaling Access')
    chimeSecurityGroup.addIngressRule(ec2.Peer.ipv4('99.77.253.0/24'), ec2.Port.udpRange(5000,65000), 'Allow Chime Voice Connector Media Access')

    const sbcAdminSecurityGroup = new ec2.SecurityGroup(this, 'sbcAdminSecurityGroup', {
      vpc,
      description: 'Security Group for Asterisk Server',
      allowAllOutbound: true 
    });

    // sbcAdminSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP Access')
    sbcAdminSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS Access')
    
    const LANSecurityGroup = new ec2.SecurityGroup(this, 'LANSecurityGroup', {
      vpc: vpc,
      description: 'Security Group for AudioCode SBC',
      allowAllOutbound: true 
    });    
    
    LANSecurityGroup.addIngressRule(ec2.Peer.ipv4(audioCodeSubnet.ipv4CidrBlock), ec2.Port.allTraffic(), 'All inbound traffic from local VPC')

    const VPNSecurityGroup = new ec2.SecurityGroup(this, 'VPNCodeSecurityGroup', {
      vpc: vpc,
      description: 'Security Group for AudioCode SBC',
      allowAllOutbound: true 
    });    

    VPNSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    VPNSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(1194), 'Allow VPN Traffic')

    const asteriskRole = new iam.Role(this, 'asteriskRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    asteriskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    const audioCodeRole = new iam.Role(this, 'audioCodeRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
      
    })    

    audioCodeRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        'aws-marketplace:MeterUsage'
      ]
    }))

    audioCodeRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    const audioCodeAmi = new ec2.LookupMachineImage({
      name: 'AudioCodes SBC 7.20A*',
      filters: {
        'description': ['AudioCodes Mediant VE SBC - PAYG*']
      },
    })

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
                    'eip': sbcEip.ref }
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

    const privateSBCAddressParameter = new ssm.StringParameter(this, 'privateSBCAddress', {
      parameterName: '/asterisk/privateSBCAddress',
      stringValue: privateSBCInterface.attrPrimaryPrivateIpAddress
    })
    
    const sbcInstance = new ec2.Instance(this, 'sbcInstance', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.R4, ec2.InstanceSize.LARGE),
      machineImage: audioCodeAmi,
      role: audioCodeRole,
      vpcSubnets: {
        subnets: [audioCodeSubnet, asteriskSubnet]
      }
    });

    new ec2.CfnEIPAssociation(this, "SBC EIP Association", {
      eip: sbcEip.ref,
      instanceId: sbcInstance.instanceId,
      networkInterfaceId: "0"
    })

    new ec2.CfnNetworkInterfaceAttachment(this, "privateSBCNetworkAtachment", {
      deviceIndex: "1",
      instanceId: sbcInstance.instanceId,
      networkInterfaceId: privateSBCInterface.ref,
      deleteOnTermination: true});


    sbcInstance.addSecurityGroup(LANSecurityGroup)      
    sbcInstance.addSecurityGroup(sbcAdminSecurityGroup)
    sbcInstance.addSecurityGroup(chimeSecurityGroup)

    const asteriskUserData = ec2.UserData.forLinux();

    const asteriskConfig = new Asset(this, 'AsteriskConfig', {path: path.join(__dirname, '../src/config.sh')});
    
    const configPath = asteriskUserData.addS3DownloadCommand({
      bucket:asteriskConfig.bucket,
      bucketKey:asteriskConfig.s3ObjectKey,
    });

    asteriskUserData.addExecuteFileCommand({
      filePath:configPath,
      arguments: '--verbose -y'
    });

    const asteriskAmi = new ec2.AmazonLinuxImage({ 
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64});
    
    const asteriskInstnace = new ec2.Instance(this, 'AsteriskInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.LARGE),
      machineImage: asteriskAmi,
      keyName: key.keyPairName,
      role: asteriskRole,
      userData: asteriskUserData,
    });

    asteriskInstnace.addSecurityGroup(LANSecurityGroup)    
    asteriskInstnace.addSecurityGroup(VPNSecurityGroup)

    asteriskConfig.grantRead(asteriskRole);
    phoneNumberParameter.grantRead(asteriskRole);
    voiceConnectorParameter.grantRead(asteriskRole);
    outboundHostNameParameter.grantRead(asteriskRole);
    privateSBCAddressParameter.grantRead(asteriskRole)

    new cdk.CfnOutput(this, 'publicSBCIP', { value: sbcInstance.instancePublicIp });
    new cdk.CfnOutput(this, 'privateSBCIP', { value: privateSBCInterface.attrPrimaryPrivateIpAddress })
    new cdk.CfnOutput(this, 'Key Name', { value: key.keyPairName })
    new cdk.CfnOutput(this, 'Download Key Command', { value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/audioCode-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem' })
    new cdk.CfnOutput(this, 'ssh command', { value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + asteriskInstnace.instancePublicIp })
    new cdk.CfnOutput(this, 'PhoneNumber', { value: phoneNumber}),
    new cdk.CfnOutput(this, 'VoiceConnector', { value: outboundHostName})
    new cdk.CfnOutput(this, 'AsteriskPrivateIP', { value: asteriskInstnace.instancePrivateIp})
    new cdk.CfnOutput(this, 'AsteriskPublicIP', { value: asteriskInstnace.instancePublicIp})
    new cdk.CfnOutput(this, 'downloadOVPNProfile', { value: 'scp -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + asteriskInstnace.instancePublicIp + ':/tmp/ChimeDemo.ovpn ./'})
    new cdk.CfnOutput(this, 'SBCInstance', { value: sbcInstance.instanceId })
  }
}
