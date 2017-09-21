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

//counter departure id
let idCounterDep = 0;
//counter arrival id
let idCounterArr = 0;

app.listen(port, function (req, res) {
    console.log('Server is listening on ' + port);
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

app.post('/search', function (req, res) {
    let IATA = req.body.IATA;
    let codeCompany = req.body.codeCompany;
    let ortradio = req.body.ortradio;
    let time = req.body.time;
    let date = new Date(req.body.date);
    date = date.setTime(time);

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
        getDeparture(urlAPIdeparture, registerFlightId);
        console.log("Send departure url data: ", urlAPIdeparture);
    }
    else {
        getArrival(urlAPIarrival, registerFlightId);
        console.log("Send arrival url data: ", urlAPIarrival);
    }
    res.redirect('/');
});

app.post('/getFromRedis', function (req, res) {
    let IATA = req.body.IATA;
    let codeCompany = req.body.codeCompany;
    let ortradio = req.body.ortradio;
    let time = req.body.time;
    let date = new Date(req.body.date);
    //console.log("1)Date", date.toString());  //03:00:00 GMT+0300 (STD)
    //console.log("2)Time", time.toString());
    datetimeUTC = date.toString().replace("03:00:00", time.toString() + ":00");
    //console.log("3)New ", datetimeUTC);

    if (ortradio == 0) {
        getData(req, res,'dep', IATA, datetimeUTC, codeCompany, getEveryId);
        console.log('dep');
    }
    else {
        getData(req, res,'arr', IATA, datetimeUTC, codeCompany, getEveryId);
        console.log('arr');
    }

});

function getDeparture(urlAPIdeparture, callback) {
    request(urlAPIdeparture, function (error, response) {   //request to departure API
        if (error)
            console.log(response.statusCode);
        else {
            let jsonData = JSON.parse(response.body);
            let arrFlghtStatuses = jsonData.flightStatuses
            arrFlghtStatuses.forEach(function (element) {
                //console.log(element);

                // Date | Destination (код) | Flight | 
                // Departure Schedule/Actual | Gate | Status
                // Airline|

                let flightId = element.flightId;
                let flightNumber = element.flightNumber;
                let departureAirportCode = element.departureAirportFsCode;
                let arrivalAirportFsCode = element.arrivalAirportFsCode;
                let gate = "No Gate";
                if (element.hasOwnProperty('airportResources') !== false)
                    gate = element.airportResources.departureGate;
                let status = element.status;
                let dateDestination = element.departureDate.dateLocal;
                let airline = element.carrierFsCode;

                //checking for existance
                //callbackCheckExistance('dep:',idCounterDep,queryFields, addToRedis);

                console.log(
                    "\nFlightId: " + flightId +
                    "\nDeparture (код): " + departureAirportCode +
                    "\nDestination (код): " + arrivalAirportFsCode +
                    "\nFlight: " + flightNumber +
                    "\nDeparture Schedule/Actual (local): " + dateDestination +
                    "\nGate: " + gate +
                    "\nStatus: " + status +
                    "\nAirline: " + airline
                );

                let queryFields = ['flightId', flightId, 'departureAirportCode', departureAirportCode, 'flightNumber', flightNumber, 'destination', arrivalAirportFsCode, 'date', dateDestination, 'gate', gate, 'status', status, 'airline', airline];
                //Fixing undefined and null variable
                for (var element in queryFields) {
                    if (queryFields.hasOwnProperty(element)) {
                        if (queryFields[element] == undefined || queryFields[element] == null) {
                            queryFields[element] = "No Data";
                            console.log(queryFields[element]);
                        }
                    }
                }

                callback('dep', queryFields);
            }, this);
        }
    });
}

function getArrival(urlAPIarrival, callback) {
    request(urlAPIarrival, function (error, response) { //request to arrival API
        if (error) {
            console.log(response.statusCode);
        }
        else {
            let jsonData = JSON.parse(response.body);
            let arrFlghtStatuses = jsonData.flightStatuses;
            arrFlghtStatuses.forEach(function (element) {
                // Date | Destination (код) | Flight | 
                // Departure Schedule/Actual | Status
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
                    "\nAirline: " + airline +
                    "\nId: " + idCounterArr
                );

                let queryFields = ['flightId', flightId, 'flightNumber', flightNumber, 'origin', departureAirportCode, 'destination', arrivalAirportFsCode, 'date', dateArrival,/*'gate',gate,*/'status', status, 'airline', airline];
                //Fixing undefined and null variable
                for (var element in queryFields) {
                    if (queryFields.hasOwnProperty(element)) {
                        if (queryFields[element] == undefined || queryFields[element] == null) {
                            queryFields[element] = "No Data";
                            console.log(queryFields[element]);

                        }
                    }
                }

                callback('arr', queryFields);
            }, this);
        }
    });
}

function registerFlightId(prefix, queryFields) {
    //let queryFields = ['flightId', flightId, 'flightNumber', flightNumber, 'destination', arrivalAirportFsCode, 'date', dateDestination, 'gate', gate, 'status', status, 'airline', airline];

    //checking existance of flightId in Redis
    client.get('flightId:' + queryFields[1] + ':' + prefix, function (err, checkId) {
        if (!checkId) {
            client.incr(prefix + ':nextId', function (err, id) {
                if (id) {
                    console.log('Id is ', id);
                    client.HMSET(prefix + ':' + id, queryFields, function (err) {
                        client.set('flightId:' + queryFields[1] + ':' + prefix, id);
                    });
                }
            });
        }
        else {
            console.log("flightId is already contains in Redis!");
            return;
        }
    });
}




function getData(req, res, prefix, IATA, datetimeUTC, codeCompany, callbackGetEveryId) {
    let idCouter = 1;
    let tmp = true;
    let objRender = [];
    IATA = IATA.toUpperCase();

    callbackGetEveryId(req, res,prefix, idCouter, IATA, datetimeUTC, codeCompany, objRender, selectFormat);
}

function getEveryId(req, res,prefix, idCouter, IATA, datetimeUTC, codeCompany, objRender, callbackSelectFormat) {
    client.hgetall(prefix + ':' + idCouter, function (err, element) {
        if (element == null) {
            //Here's continue
            callbackSelectFormat(req, res,objRender, IATA, datetimeUTC, codeCompany, prefix);
        }

        if (element !== null) {
            //Defining departure or arrival construction
            if (prefix == 'dep' && element.departureAirportCode == IATA) {
                //console.log(element);
                objRender.push(element);
            }
            else if (prefix == 'arr' && element.destination == IATA) {
                objRender.push(element);
            }

            //Go to next 
            idCouter++;
            getEveryId(req, res,prefix, idCouter, IATA, datetimeUTC, codeCompany, objRender, selectFormat);
        }
    });
}

function selectFormat(req, res,objRender, IATA, datetimeUTC, codeCompany, prefix) {
    //console.log(objRender);
    if (codeCompany === '') {
        //Destination (код) | Flight | Airline | Departure Schedule/Actual | Gate | Status
        // +/- 4 часа
        withoutCodeCompany(prefix, req, res,objRender, IATA, datetimeUTC, restrictedTimeDiapazone);
    }
    else {
        //Date | Destination (код) | Flight | Departure Schedule/Actual | Gate | Status
        // +/- 12 часов
        withCodeCompany(prefix, req, res,objRender, IATA, datetimeUTC, codeCompany);
    }
}

function withCodeCompany(prefix, req, res,objRender, IATA, datetimeUTC, codeCompany) {
    let objResult = [];

    objRender.forEach(function (element) {
        if (element.airline == codeCompany.toUpperCase()){
            //console.log(element);
            objResult.push(element);
        }
        // Render result element!!!
    }, this);


    console.log(objResult);
    if (prefix == 'dep'){
        dep = true;
        arr = false
    } else{
        dep = false;
        arr = true
    }

    
    let airlineCode = null;
    if(objResult.length>0)
        airlineCode = objResult[0].airline;

    res.render('view',{objects: objResult, withCodeCompany, dep: dep, arr: arr, airline: airlineCode});
}

function withoutCodeCompany(prefix, req, res,objRender, IATA, datetimeUTC, callbackRestrictedTimeDiapazone) {
    //console.log(datetimeUTC);
    let date = {
        year: dateformat(datetimeUTC, 'yyyy', true),
        month: dateformat(datetimeUTC, 'm', true),
        day: dateformat(datetimeUTC, 'd', true),
        hour: dateformat(datetimeUTC, 'H', true),
        minute: dateformat(datetimeUTC, 'M', true),
        senond: dateformat(datetimeUTC, 's', true)
    }

    let startTime = new Date(Date.UTC(date.year, Number(date.month) - 1, date.day, Number(date.hour) - 4, date.minute));
    //console.log(startTime, ":start time");
    let endTime = new Date(Date.UTC(date.year, Number(date.month) - 1, date.day, Number(date.hour) + 4, date.minute));
    //console.log(endTime, ":end time\n");


    let objResult = [];

    objRender.forEach(function (element) {
        //callbackRestrictedTimeDiapazone(startTime, endTime, element);
        time = new Date(Date.parse(element.date));
        if (time > startTime && time < endTime){
            //console.log(element);
            objResult.push(element);
        }
    }, this);


    console.log(objResult);
    if (prefix == 'dep'){
        dep = true;
        arr = false
    } else{
        dep = false;
        arr = true
    }
    res.render('view',{objects: objResult, withoutCodeCompany: true, dep: dep, arr: arr, startTime: startTime, endTime: endTime});
}

function restrictedTimeDiapazone(startTime, endTime, element) {
    time = new Date(Date.parse(element.date));
    if (time > startTime && time < endTime)
        console.log(element);
}