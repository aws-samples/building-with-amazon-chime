import gzip
import json
import base64

 
def lambda_handler(event, context):
    log_data = event['awslogs']['data']
    compressed_data = base64.b64decode(log_data)
    uncompressed_data = gzip.decompress(compressed_data)
    logs = json.loads(uncompressed_data)
    log_events = logs['logEvents']
    for x in log_events:
        print(x)
        sip_message = str(x['message'])
        x_header_start = sip_message.find('X-Header-Support')
        if not x_header_start == -1:
            x_header = sip_message[(x_header_start+18):(x_header_start+30)]
            print("X-Header: " + x_header)