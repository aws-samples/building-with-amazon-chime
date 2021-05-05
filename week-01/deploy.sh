 #!/bin/bash
## Copyright Amazon.com Inc. or its affiliates.
function valid_ip()
{
    local  ip=$1
    local  stat=1

    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        OIFS=$IFS
        IFS='.'
        ip=($ip)
        IFS=$OIFS
        [[ ${ip[0]} -le 255 && ${ip[1]} -le 255 \
            && ${ip[2]} -le 255 && ${ip[3]} -le 255 ]]
        stat=$?
    fi
    return $stat
}
ExternalIP=''

if [ -f "cdk.context.json" ]; then
    echo ""
    echo "INFO: Removing cdk.context.json"
    rm cdk.context.json
else
    echo ""
    echo "INFO: cdk.context.json not present, nothing to remove"
fi
if [ ! -f "package-lock.json" ]; then
    echo ""
    echo "Installing Packages"
    echo ""
    npm install
fi
echo ""
echo "Getting External IP address for Security Group"
echo ""
if [ -x "$(which curl)" ] ; then
    echo "Using Curl"
    ExternalIP=$( curl checkip.amazonaws.com )
    echo "External IP: " $ExternalIP
else
    while true; do
        read -p "Enter IPv4 address to allow access in Security Group: " ExternalIP
        if valid_ip $ExternalIP; then
            break
        else
            echo "Please enter a valid IPv4 address in the form of XXX.XXX.XXX.XXX"
        fi
    done
fi
echo ""
echo "Building CDK"
echo ""
npm run build
echo ""
echo "Deploying CDK"
echo ""
cdk deploy -c SecurityGroupIP=$ExternalIP