# Overview

Nodejs API service that takes GTFS & GTFS-R data from the Irish National Transport Authority and exposes
real-time bus stops & departure information.

Currently WIP, but GTFS ingestion and GTFS-R data augemtation are all implemented.

On initial run the app will download the GTFS data and import it into a local SQLite DB
(./db.sqlite). The app will re-request the data upon startup after an interval of 7 days.

# install

```sh
nmp i
```

# run

`NTA_API_KEY` is API key from https://developer.nationaltransport.ie/

```sh
NTA_API_KEY=<NTA_API_KEY> npm run start:dev
```

# debug

Use the environment variable `DEBUG=true` to output runtime debug information.

# API

## /getStopsByRoute?route=<route_id>

Returns a list of stops on a particular route with GPS coordinates to allow finding your local stop.

example: `http://localhost:7777/getStopsByRoute?route=9`

## /getStopTimes?route=<route_id>&stop_id=<stop_id>

Returns a list of stop times for a particular route. `departure_mins` is the same as what you might
see on the bus stop displays IRL.

example: `http://localhost:7777/getStopTimes?route=9&stop_id=8220DB000143`