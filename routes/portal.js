module.exports = function(app, dir, RED, settings_nodered) {
    var fs = require("fs");
    var path = require("path");
    var bodyParser = require('body-parser');
    var execFile = require('child_process').execFile;
    var iw = require('iwlist')('wlan0');
    var os = require("os");
    var ifaces = os.networkInterfaces();

    function setAP(enable, callback){
        var id = (settings_nodered.functionGlobalContext.settings.id || "ap").slice(-4);
        var command = "/bin/bash";
        var args = [];
        var opts = {
            cwd: path.join(dir, "access_point"),
            uid: 0,
            gid: 0
        };

        if(enable){            
            args.push(path.join(opts.cwd, "enable.sh"));
            args.push(id);
        } else {
            args.push(path.join(opts.cwd, "disable.sh"));
        }

        var bash = execFile(command, args, opts, function(err, stdin, stdout){
            if(err){
                console.log(command, args, opts);
                console.log(err);
                console.log(stdin);
                console.log(stdout);
            }
            if(typeof callback === "function"){
                callback(err);
            }
        });
    }

    function setWiFi(params, callback){
        var filename = "/etc/wpa_supplicant/wpa_supplicant.conf";
        var options = { flag : 'w' };
        var conf =  "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev" +
                    "\nupdate_config=1" +
                    "\n" +
                    "\nnetwork={" +
                    "\n\tssid=\"" + params.ssid + "\"";
        if (params.secured == "true"){
            conf += "\n\tpsk=\"" + params.password + "\"" +
                    "\n\tkey_mgmt=WPA-PSK";
        } else {
            conf += "\n\tkey_mgmt=NONE";
        }
        conf +=     "\n}" +
                    "\n";

        fs.writeFile(filename, conf, options, function(err){
            if(typeof callback === "function"){
                callback(err);
            }
        });
    }

    function reboot(){
        var command = "reboot";
        var args = [];
        var opts = {
            cwd: dir,
            uid: 0,
            gid: 0
        };
        var reboot = execFile(command, args, opts, function(err, stdin, stdout){
            if(err){
                console.log(command, args, opts);
                console.log(err);
                console.log(stdin);
                console.log(stdout);
            }
        });
    }

    app.set('views', path.join(dir, 'views'));
    app.set('view engine', 'ejs');

    try {
        iw.scan(function(err, networks){
            if(err){
                return;
            }

            if(ifaces.hasOwnProperty("eth0")){
                setAP(false);        
            } else {
                iw.associated(function(err, associated){
                    if(!associated){
                        setAP(true);
                        app.use("/portal", bodyParser.urlencoded({ extended: true }));

                        app.get("/portal",
                            function(req, res) {
                                res.header("Access-Control-Allow-Origin", "*");
                                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                                iw.scan(function(err, networks){
                                    var wifilist;
                                    if(err){
                                        wifilist = [];
                                    } else {
                                        wifilist = networks.filter(function(e){
                                            return (e.essid)?true:false;
                                        });
                                    }

                                    res.render('portal', {
                                        wifilist: {
                                            secured: wifilist.filter(function(d){return d.encrypted}),
                                            open: wifilist.filter(function(d){return !d.encrypted})
                                        }
                                    });
                                });
                            }
                        );

                        app.post("/portal",
                            function(req, res) {
                                var data = req.body;
                                console.log(typeof data, data)
                                if(data.secured == "true" && data.password == ""){
                                    res.status(403).json({message: "Password should be filled", error: "no_password"})
                                } else {
                                    setWiFi(data, function(err){
                                        if(err){
                                            res.status(500).json({message:"Cannot set the Wifi", error: err}); 
                                        } else {
                                            res.json({message:"The WiFi "+ data.ssid +" has been set.<br/>I will reboot in a few seconds.<br/>Please connect your computer/phone on this network.", hostname: os.hostname()});
                                            setAP(false, function(){
                                                 setTimeout(reboot, 2000);
                                            });
                                        }
                                    });
                                }
                            }
                        );
                    }
                });
            }
        });
    } catche(e){}

    return true;
}
