 #!/bin/bash    
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
echo "Building CDK"
echo ""
npm run build
echo ""
echo "Deploying CDK"
echo ""
cdk deploy --parameters SecurityGroupIP=$ExternalIP -O SBC_Config/cdk-outputs.json
pushd SBC_Config
node buildSBCConfig.js
popd
