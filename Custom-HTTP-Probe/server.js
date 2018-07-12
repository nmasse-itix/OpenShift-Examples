var express = require("express");
var app = express();
var router = express.Router();
var port = 8080;

var alive = true;
var countdown = 30;

// This is our access_log
router.use(function (req,res,next) {
  next();
  console.log("[%s] %s %s => %i", new Date().toUTCString(), req.method, req.originalUrl, res.statusCode);
});

function getState() {
    var response = {
        "ready": countdown <= 0, 
        "alive": alive,
        "pod": process.env["HOSTNAME"]
    };

    if (countdown > 0) {
        response.countdown = countdown;
    }

    return response;
}

function doCountdown() {
    if (countdown > 0) {
        countdown--;
        setTimeout(doCountdown, 1000);
    }
}
// Countdown before announcing our readiness
doCountdown();

// Help message
router.get("/",function(req,res){
    var response = {
        paths: {
            '/please-die': 'This app will die very soon !',
            '/please-resuscitate': 'This app will come back to life !',
            '/': 'This message',
            '/probe/readiness': 'Standard readiness probe',
            '/probe/liveness': 'Standard liveness probe',
            '/probe/custom': 'A strange custom probe...'
        }, 
        state: getState()
    }
    res.type('application/json')
        .send(JSON.stringify(response))
        .end();
});

router.get("/please-die",function(req,res){
    alive = false;
    var response = getState();
    res.type('application/json')
       .send(JSON.stringify(response))
       .end();
});

router.get("/please-resuscitate",function(req,res){
    alive = true;
    var response = getState();
    res.type('application/json')
       .send(JSON.stringify(response))
       .end();
});

router.get("/probe/readiness",function(req,res){
    var response = getState();
    res.type('application/json')
       .status(countdown <= 0 ? 200 : 503)
       .send(JSON.stringify(response))
       .end();
});

router.get("/probe/liveness",function(req,res){
    var response = getState();
    res.type('application/json')
       .status(alive ? 200 : 500)
       .send(JSON.stringify(response))
       .end();
});

router.get("/probe/custom",function(req,res){
    if (alive && countdown <= 0) {
        res.type('application/json')
           .status(418)
           .send(JSON.stringify(getState()))
           .end();
    } else {
        res.type('text/html')
           .status(500)
           .send("<h1>I'm dead... X-)</h1>")
           .end();
    }
});
  
app.use("/",router);

app.use("*",function(req,res){
  res.status(404).send("Not found");
});

app.listen(port,function(){
  console.log("Live at Port %i", port);
});
