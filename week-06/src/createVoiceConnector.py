import boto3
import time
import uuid

chime = boto3.client('chime')

def authorizeOrigination (voiceConnectorId, elasticIP):
  print("Authorizing Origination: " + voiceConnectorId)
  response = chime.put_voice_connector_origination(
    VoiceConnectorId=voiceConnectorId,
    Origination={
        'Routes': [
            {
                'Host': elasticIP,
                'Port': 5060,
                'Protocol': 'UDP',
                'Priority': 1,
                'Weight': 1
            },
        ],
        'Disabled': False
    }
  )
  print("Origination Authorized: " + str(response))

def authorizeTermination (voiceConnectorId, elasticIP):
  print("Authorizing Termination: " + voiceConnectorId)
  response = chime.put_voice_connector_termination(
    VoiceConnectorId=voiceConnectorId,
    Termination={
        'CpsLimit': 1,
        'CallingRegions': [
            'US',
        ],
        'CidrAllowedList': [
            elasticIP + '/32',
        ],
        'Disabled': False
    }
  )
  print("Termination Authorized: " + str(response))

def enableStreaming (voiceConnectorId):
  response = chime.put_voice_connector_streaming_configuration(
      VoiceConnectorId=voiceConnectorId,
      StreamingConfiguration={
          'DataRetentionInHours': 1,
          'Disabled': False,
          'StreamingNotificationTargets': [
              {
                  'NotificationTarget': 'EventBridge'
              },
          ]
      }
  )
  print("Streaming Enabled: " + str(response))

def getPhoneNumber ():
  print("Getting Phone Number")
  search_response = chime.search_available_phone_numbers(
      # AreaCode='string',
      # City='string',
      # Country='string',
      State='IL',
      # TollFreePrefix='string',
      MaxResults=1
  )
  phoneNumberToOrder = search_response['E164PhoneNumbers'][0]
  print ('Phone Number: ' + phoneNumberToOrder)
  phone_order = chime.create_phone_number_order(
      ProductType='VoiceConnector',
      E164PhoneNumbers=[
          phoneNumberToOrder,
      ]
  )
  print ('Phone Order: ' + str(phone_order))

  check_phone_order = chime.get_phone_number_order(
    PhoneNumberOrderId=phone_order['PhoneNumberOrder']['PhoneNumberOrderId']
  )
  order_status = check_phone_order['PhoneNumberOrder']['Status']
  timeout = 0

  while not order_status == 'Successful':
    timeout += 1  
    print('Checking status: ' + str(order_status))
    time.sleep(5)
    check_phone_order = chime.get_phone_number_order(
      PhoneNumberOrderId=phone_order['PhoneNumberOrder']['PhoneNumberOrderId']
    )
    order_status = check_phone_order['PhoneNumberOrder']['Status']
    if timeout == 5:
      return 'Could not get phone number'
  print ("Phone Number Ordered: " + phoneNumberToOrder)
  return phoneNumberToOrder

def createVoiceConnector (region):
  print("Creating Voice Connector")
  response = chime.create_voice_connector(
      Name='Trunk' + str(uuid.uuid1()),
      AwsRegion='us-east-1',
      RequireEncryption=False
  )
      
  voiceConnectorId = response['VoiceConnector']['VoiceConnectorId']
  outboundHostName = response['VoiceConnector']['OutboundHostName']
  voiceConnector = { 'voiceConnectorId': voiceConnectorId, 'outboundHostName': outboundHostName}
  print("Voice Connector Created: " + str(response))
  print("voiceConnector: " + str(voiceConnector))
  return voiceConnector

def assoiciatePhoneNumber (voiceConnector, phoneNumber):
  print("Associating Phone Number: " + str(voiceConnector))
  print("Associating Phone Number: " + phoneNumber)
  response = chime.associate_phone_numbers_with_voice_connector(
      VoiceConnectorId=voiceConnector['voiceConnectorId'],
      E164PhoneNumbers=[
          phoneNumber,
      ],
      ForceAssociate=True
  )
  print("Phone Number associated: " + str(response))
  voiceConnector['phoneNumber'] = phoneNumber
  print("voiceConnector: "+ str(voiceConnector))
  return voiceConnector


def on_event(event, context):
  print(event)
  request_type = event['RequestType']
  if request_type == 'Create': return on_create(event)
  if request_type == 'Update': return on_update(event)
  if request_type == 'Delete': return on_delete(event)
  raise Exception("Invalid request type: %s" % request_type)

def on_create(event):
  physical_id = 'VoiceConnectorResources'
  region = event['ResourceProperties']['region']
  elasticIP = event['ResourceProperties']['eip']
  streaming = event['ResourceProperties']['streaming']
  print('Streaming: ' + streaming)

  if streaming == 'true':
    print("Creating VoiceConnector with Streaming")
    voiceConnector = createVoiceConnector(region)
    authorizeTermination(voiceConnector['voiceConnectorId'], elasticIP)
    enableStreaming(voiceConnector['voiceConnectorId'])
    voiceConnector['phoneNumber'] = ''
  else:
    print("Creating VoiceConnector with Phone Number and without Streaming")
    newPhoneNumber = getPhoneNumber()
    voiceConnector = createVoiceConnector(region)
    voiceConnector = assoiciatePhoneNumber(voiceConnector,newPhoneNumber)
    authorizeTermination(voiceConnector['voiceConnectorId'], elasticIP)
    authorizeOrigination(voiceConnector['voiceConnectorId'], elasticIP)

  print(str(voiceConnector))
  return { 'PhysicalResourceId': physical_id, 'Data': voiceConnector }

def on_update(event):
  physical_id = event["PhysicalResourceId"]
  props = event["ResourceProperties"]
  print("update resource %s with props %s" % (physical_id, props))
  return { 'PhysicalResourceId': physical_id }  


def on_delete(event):
  physical_id = event["PhysicalResourceId"]
  print("delete resource %s" % physical_id)
  return { 'PhysicalResourceId': physical_id }
