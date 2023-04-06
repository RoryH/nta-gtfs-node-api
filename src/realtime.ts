import { isArray, isNil, isPlainObject } from '@flowio/is';
import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
import { GtfsRealtimeFeed } from './types';
import { GTFS_REALTIME_CACHE_FILENAME } from './constants';

const apiKey = process.env.NTA_API_KEY;

if (isNil(apiKey)) {
  throw new Error('NTA_API_KEY is not set');
}

function isGtfsRealtimeFeed(value: unknown): value is GtfsRealtimeFeed {
  return isPlainObject(value)
    && isPlainObject((value as GtfsRealtimeFeed).header)
    && isArray((value as GtfsRealtimeFeed).entity);
}

export async function refreshRealtimeData(): Promise<GtfsRealtimeFeed | undefined> {
  if (isNil(apiKey)) {
    throw new Error('NTA_API_KEY is not set');
  }
  return fetch('https://api.nationaltransport.ie/gtfsr/v2/gtfsr?format=json',
  {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    }
  }).then((resp) => {
    console.log(`fetched, status: ${resp.status}`)
    if (resp.ok) {
      return resp.json();
    } else {
      throw new Error('Error fetching Real-time data');
    }
  }).then((body: unknown) => {
    if (isGtfsRealtimeFeed(body)) {
      writeFile(GTFS_REALTIME_CACHE_FILENAME, JSON.stringify(body), 'utf8');
      /* console.log(body.entity.map((entity) => ({
        routeId: entity.trip_update?.trip.route_id,
        stopIds: entity.trip_update?.stop_time_update?.map((stopTimeUpdate) => stopTimeUpdate.stop_id),
      }))); */
      console.log('Successfully updated real-time data.');
      return body;
    } else {
      throw new Error('Unknown data format returned');
    }
  });
}

