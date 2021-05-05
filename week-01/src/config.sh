#!/bin/bash -xe
## Copyright Amazon.com Inc. or its affiliates.
HOMEDIR=/home/ec2-user
yum update -y
yum install net-tools -y
yum install wget -y
yum -y install make gcc gcc-c++ make subversion libxml2-devel ncurses-devel openssl-devel vim-enhanced man glibc-devel autoconf libnewt kernel-devel kernel-headers linux-headers openssl-devel zlib-devel libsrtp libsrtp-devel uuid libuuid-devel mariadb-server jansson-devel libsqlite3x libsqlite3x-devel epel-release.noarch bash-completion bash-completion-extras unixODBC unixODBC-devel libtool-ltdl libtool-ltdl-devel mysql-connector-odbc mlocate libiodbc sqlite sqlite-devel sql-devel.i686 sqlite-doc.noarch sqlite-tcl.x86_64 patch libedit-devel jq
cd /tmp
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-16-current.tar.gz
tar xvzf asterisk-16-current.tar.gz 
cd asterisk-16*/
./configure --libdir=/usr/lib64 --with-jansson-bundled
make menuselect.makeopts
menuselect/menuselect \
        --disable BUILD_NATIVE \
        --disable chan_sip \
        --disable chan_skinny \
        --enable cdr_csv \
        --enable res_snmp \
        --enable res_http_websocket \
        menuselect.makeopts
make 
make install
make basic-pbx
touch /etc/redhat-release
make config
ldconfig

#!/bin/bash -xe
IP=$( curl http://169.254.169.254/latest/meta-data/public-ipv4 )
PhoneNumber=$( aws ssm get-parameter --name /asterisk/phoneNumber --region us-east-1 | jq -r '.Parameter.Value' )
VoiceConnectorHost=$( aws ssm get-parameter --name /asterisk/voiceConnector --region us-east-1 | jq -r '.Parameter.Value' )
OutboundHostName=$( aws ssm get-parameter --name /asterisk/outboundHostName --region us-east-1 | jq -r '.Parameter.Value' )

echo "[udp]
type=transport
protocol=udp
bind=0.0.0.0
external_media_address=$IP
external_signaling_address=$IP
allow_reload=yes

[VoiceConnector]
type=endpoint
context=from-voiceConnector
transport=udp
disallow=all
allow=ulaw
aors=VoiceConnector
direct_media=no
ice_support=yes
force_rport=yes

[VoiceConnector]
type=identify
endpoint=VoiceConnector
match=$OutboundHostName

[VoiceConnector]
type=aor
contact=sip:$OutboundHostName

[$PhoneNumber]
type=endpoint
context=from-phone
disallow=all
allow=ulaw
transport=udp
auth=$PhoneNumber
aors=$PhoneNumber
send_pai=yes
direct_media=no
rewrite_contact=yes
ice_support=yes
force_rport=yes

[$PhoneNumber]
type=auth
auth_type=userpass
password=ChimeDemo
username=$PhoneNumber

[$PhoneNumber]
type=aor
max_contacts=5" > /etc/asterisk/pjsip.conf

echo "; extensions.conf - the Asterisk dial plan
;
[general]
static=yes
writeprotect=no
clearglobalvars=no

[catch-all]
exten => _[+0-9].,1,Answer()
exten => _[+0-9].,n,Wait(1)
exten => _[+0-9].,n,Playback(hello-world)
exten => _[+0-9].,n,Wait(1)
exten => _[+0-9].,n,echo()
exten => _[+0-9].,n,Wait(1)
exten => _[+0-9].,n,Hangup()

[from-phone]
include => outbound_phone

[outbound_phone]
exten => _+X.,1,NoOP(Outbound Normal)
same => n,Dial(PJSIP/\${EXTEN}@VoiceConnector,20)
same => n,Congestion

[from-voiceConnector]
include => phones
include => catch-all

[phones]
exten => $PhoneNumber,1,Dial(PJSIP/$PhoneNumber)" > /etc/asterisk/extensions.conf

echo "[options]
runuser = asterisk
rungroup = asterisk" > /etc/asterisk/asterisk.conf

echo "[general]
[logfiles]
console = verbose,notice,warning,error
messages = notice,warning,error" > /etc/asterisk/logger.conf

groupadd asterisk
useradd -r -d /var/lib/asterisk -g asterisk asterisk
usermod -aG audio,dialout asterisk
chown -R asterisk.asterisk /etc/asterisk
chown -R asterisk.asterisk /var/{lib,log,spool}/asterisk

systemctl start asterisk
