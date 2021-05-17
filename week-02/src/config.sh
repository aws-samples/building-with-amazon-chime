#!/bin/bash -xe
HOMEDIR=/home/ec2-user
yum update -y
yum install net-tools -y
yum install wget -y
yum -y install make gcc gcc-c++ make subversion libxml2-devel ncurses-devel openssl-devel vim-enhanced man glibc-devel autoconf libnewt kernel-devel kernel-headers linux-headers openssl-devel zlib-devel libsrtp libsrtp-devel uuid libuuid-devel mariadb-server jansson-devel libsqlite3x libsqlite3x-devel epel-release.noarch bash-completion bash-completion-extras unixODBC unixODBC-devel libtool-ltdl libtool-ltdl-devel mysql-connector-odbc mlocate libiodbc sqlite sqlite-devel sql-devel.i686 sqlite-doc.noarch sqlite-tcl.x86_64 patch libedit-devel libtiff-devel jq
amazon-linux-extras install epel -y
yum install inotify-tools -y
yum install ImageMagick ImageMagick-devel -y
cd /tmp
wget https://www.soft-switch.org/downloads/spandsp/spandsp-0.0.6.tar.gz
tar xvzf spandsp-0.0.6.tar.gz
cd spandsp-0.0.6/
./configure
make
make install
echo "/usr/local/lib" >> /etc/ld.so.conf.d/usrlocallib.conf
ldconfig
cd -
wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-16-current.tar.gz
tar xvzf asterisk-16-current.tar.gz 
cd asterisk-16*/
./configure --libdir=/usr/lib64 --with-jansson-bundled
make -j$(nproc) menuselect.makeopts
menuselect/menuselect \
        --disable BUILD_NATIVE \
        --disable chan_sip \
        --disable chan_skinny \
        --enable cdr_csv \
        --enable res_snmp \
        --enable res_fax_spandsp \
        --enable res_http_websocket \
        menuselect.makeopts \
make 
make install
make basic-pbx
touch /etc/redhat-release
make config
ldconfig

IP=$( curl http://169.254.169.254/latest/meta-data/public-ipv4 )
PhoneNumber=$( aws ssm get-parameter --name /asterisk/phoneNumber --region us-east-1 | jq -r '.Parameter.Value' )
VoiceConnectorHost=$( aws ssm get-parameter --name /asterisk/voiceConnector --region us-east-1 | jq -r '.Parameter.Value' )
OutboundHostName=$( aws ssm get-parameter --name /asterisk/outboundHostName --region us-east-1 | jq -r '.Parameter.Value' )
IncomingFaxBucket=$( aws ssm get-parameter --name /asterisk/incomingFaxBucket --region us-east-1 | jq -r '.Parameter.Value' )

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

[from-voiceConnector]
include => faxnumber

[faxnumber]
exten => $PhoneNumber,1,NoOp(Receiving Fax)
same => n,Set(FAXDIRECTORY=/etc/asterisk/incoming_faxes)
same => n,Set(FAXNAME=\${STRFTIME(,,%s)})
same => n,ReceiveFax(\${FAXDIRECTORY}/\${FAXNAME}.tif)
same => n,NoOp(Fax Finished: \${FAXSTATUS})

[sendfax]
exten => s,1,NoOP()
same => n,SendFax(/tmp/faxfile.tif,fs)
same => n,Hangup()

[outboundfax]
exten => _+X.,1,NoOP(Sending Fax)
same => n,Set(CALLERID(num)=$PhoneNumber)
same => n,Dial(PJSIP/\${EXTEN}@VoiceConnector,30)" > /etc/asterisk/extensions.conf

echo "load = res_fax.so
load = res_fax_spandsp.so
load = pbx_spool.so
load = res_clioriginate.so" >> /etc/asterisk/modules.conf

echo "[options]
runuser = asterisk
rungroup = asterisk" > /etc/asterisk/asterisk.conf

echo "[general]
[logfiles]
console = verbose,notice,warning,error
messages = notice,warning,error" > /etc/asterisk/logger.conf

mkdir /etc/asterisk/incoming_faxes
mkdir /etc/asterisk/converted_faxes

echo "
#!/usr/bin/env bash
while true; do
	inotifywait /etc/asterisk/incoming_faxes -e moved_to -e close -e close_write --format '%f' | while read file; do
		filename=\"\${file%.*}\"
		convert /etc/asterisk/incoming_faxes/\$filename.tif /etc/asterisk/converted_faxes/\$filename.jpg
		aws s3 cp /etc/asterisk/converted_faxes/\$filename.jpg s3://$IncomingFaxBucket
	done
done" > /usr/bin/watch_dir.sh

chmod +x /usr/bin/watch_dir.sh
/usr/bin/watch_dir.sh &

(crontab -l ; echo "@reboot  /usr/bin/watch_dir.sh") | crontab -

groupadd asterisk
useradd -r -d /var/lib/asterisk -g asterisk asterisk
usermod -aG audio,dialout asterisk
chown -R asterisk.asterisk /etc/asterisk
chown -R asterisk.asterisk /etc/asterisk/incoming_faxes
chown -R asterisk.asterisk /etc/asterisk/converted_faxes
chown -R asterisk.asterisk /var/{lib,log,spool}/asterisk

systemctl start asterisk