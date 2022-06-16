# Overview

Nodejs API service that takes GTFS & GTFS-R data from the Irish National Transport Authority and exposes
real-time bus stops & departure information.

Currently WIP, but GTFS ingestion and GTFS-R data augemtation are all implemented.

# install

```sh
nmp i
```

# run

`NTA_API_KEY` is API key from https://developer.nationaltransport.ie/

```sh
NTA_API_KEY=<NTA_API_KEY> npm run start:dev
```