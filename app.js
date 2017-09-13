const express = require('express');
const redis = require('redis');
const path = require('path');
const bodyParser = require('body-parser');
const hbs = require('express-handlebars');
const request = require('request');
const dateformat = require('dateformat');

// init app
const app = express();

//set port
const port = 3000;

//set body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//set view engine
app.engine('handlebars', hbs({ defaultLayout: 'index', partialsDir: 'views' }));
app.set('view engine', 'handlebars');

//API settings (https://developer.flightstats.com/api-docs/flightstatus/v2/airport)
let appIdstr = "4b7d1cfa";
let apiKeystr = "bd33d20a4a98aea973da989aba666ffc";

//Create Redis Client
const client = redis.createClient();
client.on('connect', function (req, res, next) {
    console.log("Redis is connected!");
});

app.get('/', function (req, res) {
    res.render('main');
});

app.get('/add/schedule', function (req, res, next) {
    res.render('search');
});

app.get('/get/schedule', function (req, res, next) {
    res.render('details');
});

app.listen(port, function (req, res) {
    console.log('Server is listening on ' + port);
});

app.post('/search', function (req, res) {
    let IATA = req.body.IATA;
    let codeCompany = req.body.codeCompany;
    let ortradio = req.body.ortradio;
    let date = new Date(req.body.date);

    let datetimeUTC = {
        year: dateformat(date, 'yyyy', true),
        month: dateformat(date, 'm', true),
        day: dateformat(date, 'd', true),
        hour: dateformat(date, 'H', true),
        minute: dateformat(date, 'M', true),
        senond: dateformat(date, 's', true)
    }

    //UTC is true, code type is IATA
    let urlAPIdeparture = "https://api.flightstats.com/flex/flightstatus/rest/v2/json/airport/status/" + IATA + "/dep/" + datetimeUTC.year + "/" + datetimeUTC.month + "/" + datetimeUTC.day + "/" + datetimeUTC.hour + "?appId=" + appIdstr + "&appKey=" + apiKeystr + "&utc=true&numHours=6&codeType=IATA";
    let urlAPIarrival = "https://api.flightstats.com/flex/flightstatus/rest/v2/json/airport/status/" + IATA + "/arr/" + datetimeUTC.year + "/" + datetimeUTC.month + "/" + datetimeUTC.day + "/" + datetimeUTC.hour + "?appId=" + appIdstr + "&appKey=" + apiKeystr + "&utc=true&numHours=6&codeType=IATA";
    /* 
    test dateformat module...
    console.log(date);
    console.log(datetimeUTC.day);
    console.log(datetimeUTC.hour);
    */
    //let counterID = 0;

    if (ortradio == 0) {
        getDeparture(urlAPIdeparture);
    }
    else {
        getArrival(urlAPIarrival);
    }
    res.redirect('/');
});

//I use Primuses to avoid "callback hell" and save code asynchronous :)
app.post('/sendQuery', function (req, res, next) {
    defineQueryId(req).then(getFromRedis);
    res.render('details');
});

let counterID = new createCounterID();

function createCounterID() {
    let counter;
    function plus() {
        this.counter++;
    }
}

function addToRedis(counterID, queryFields) {
    counterID.plus();
    client.hgetall('id:' + counterID, function (err, obj) { //check if hash already exists
        if (!obj) {

            client.HMSET('id:' + counterID, queryFields, function (err, reply) {
                if (err) {
                    console.log(err);
                }
                console.log(reply);
            });

            //Here function for adding data to DB
            console.log("Added " + 'id:' + counterID);
        }
    });
}

function defineQueryId(req) {
    return new Promise((resolve, reject) => {
        // (ID = 0) If company code is not set
        // (ID = 1) If company code is set
        req.body.codeCompany == "" ? req.body.ID = 0 : req.body.ID = 1;
        req.body.ID == 0 || req.body.ID == 1 ? resolve(req) : reject('Somothing is wrong... sorry... :(');
    });
}

function getFromRedis(req) {
    let IATA = req.body.IATA;
    let codeCompany = req.body.codeCompany;
    let ortradio = req.body.ortradio;
    let date = new Date(req.body.date);

    let datetimeUTC = {
        year: dateformat(date, 'yyyy', true),
        month: dateformat(date, 'm', true),
        day: dateformat(date, 'd', true),
        hour: dateformat(date, 'H', true),
        minute: dateformat(date, 'M', true),
        senond: dateformat(date, 's', true)
    }

    console.log("ID: " + req.body.ID);
    //Destination (код) | Flight | Airline | Departure Schedule/Actual | Gate | Status
    if (req.body.ID == 0) {
        let queryFields = ['flightNumber', flightNumber, 'destination', arrivalAirportFsCode, 'date', dateDestination, 'gate', gate, 'status', status, 'airline', airline];
        addToRedis(queryFields);
    }
    else {

    }
}

function getDeparture(urlAPIdeparture) {
    request(urlAPIdeparture, function (error, response) {

        if (error) {
            console.log(response.statusCode);
        }
        else {
            let jsonData = JSON.parse(response.body);
            let arrFlghtStatuses = jsonData.flightStatuses
            arrFlghtStatuses.forEach(function (element) {
                //console.log(element);

                // Date | Destination (код) | Flight | 
                // Departure Schedule/Actual | Gate | Status
                // Airline|

                let flightNumber = element.flightNumber;
                let departureAirportCode = element.departureAirportFsCode;
                let arrivalAirportFsCode = element.arrivalAirportFsCode;
                let gate = element.airportResources.departureGate;
                let status = element.status;
                let dateDestination = element.departureDate.dateLocal;
                let airline = element.carrierFsCode;
                let flightId = element.flightId;

                console.log(
                    "\nFlightId: " + flightId +
                    "\nDestination (код): " + arrivalAirportFsCode +
                    "\nFlight: " + flightNumber +
                    "\nDeparture Schedule/Actual (local): " + dateDestination +
                    "\nGate: " + gate +
                    "\nStatus: " + status +
                    "\nAirline: " + airline
                );

                let queryFields = ['flightNumber', flightNumber, 'destination', arrivalAirportFsCode, 'date', dateDestination, 'gate', gate, 'status', status, 'airline', airline];
                addToRedis(counterID, queryFields);

            }, this);
        }
    });
}

function getArrival(urlAPIarrival) {
    request(urlAPIarrival, function (error, response) {

        if (error) {
            console.log(response.statusCode);
        }
        else {
            let jsonData = JSON.parse(response.body);
            let arrFlghtStatuses = jsonData.flightStatuses;
            arrFlghtStatuses.forEach(function (element) {
                //console.log(element);

                // Date | Destination (код) | Flight | 
                // Departure Schedule/Actual | Gate | Status
                // Airline|

                let flightNumber = element.flightNumber;
                let departureAirportCode = element.departureAirportFsCode;
                let arrivalAirportFsCode = element.arrivalAirportFsCode;
                //let gate = element.airportResources.departureGate;
                let status = element.status;
                let dateArrival = element.arrivalDate.dateLocal;
                let airline = element.carrierFsCode;
                let flightId = element.flightId;

                console.log(
                    "\nFlightId: " + flightId +
                    "\nDestination (код): " + arrivalAirportFsCode +
                    "\nFlight: " + flightNumber +
                    "\nArrival: " + dateArrival +
                    //"\nGate: "+ gate +
                    "\nStatus: " + status +
                    "\nAirline: " + airline
                );

                let queryFields = ['flightNumber', flightNumber, 'origin', departureAirportCode, 'date', dateArrival,/*'gate',gate,*/'status', status, 'airline', airline];
                addToRedis(flightId, queryFields);

            }, this);
        }
    });
}