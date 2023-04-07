import { isNil, isNotNil } from '@flowio/is';
import express from 'express';
import sortBy from 'lodash/sortBy';
import moment from 'moment-timezone';
import type { GtfsRealtimeFeed, GtfsRealtimeStopTimeUpdate, StopTime, StopTimesApiResult, StopTimesQueryResult } from './types';
import { APP_CONFIG_ROUTE_ID_MAP } from './constants';

export function getRouteId(app: express.Application, routeShortName: string) {
  return app.get(APP_CONFIG_ROUTE_ID_MAP)[routeShortName].id;
}

export function getShortRouteName(app: express.Application, routeId: string) {
  const found = Object.entries<string>(app.get(APP_CONFIG_ROUTE_ID_MAP)).find(([, id]) => {
    return id === routeId
  });
  if (isNotNil(found)) {
    return found[0];
  }
  console.warn(`Could not find route short name for route id: ${routeId}`);
  return undefined;
}

function getStopTimeUpdates(time: StopTimesQueryResult, rt: GtfsRealtimeFeed): GtfsRealtimeStopTimeUpdate[] {
  const tripUpdates = rt.entity.filter((entity) => {
    return isNotNil(entity.trip_update) ? entity.trip_update.trip.trip_id === time.trip_id : false;
  });

  if (tripUpdates.length > 1) {
    console.log('Got more then 1 entry for a unique trip_id in the realtime feed :-/');
  }

  return tripUpdates.reduce<GtfsRealtimeStopTimeUpdate[]>((acc, tripUpdate) => {
    if (isNotNil(tripUpdate.trip_update) && isNotNil(tripUpdate.trip_update.stop_time_update)) {
      tripUpdate.trip_update.stop_time_update.forEach((stopTimeUpdate) => {
        const stopIdsEqual = stopTimeUpdate.stop_id === time.stop_id;
        const stopSequenceEqual = stopTimeUpdate.stop_sequence === time.stop_sequence;

        if ((stopIdsEqual && stopSequenceEqual)
          || (isNil(stopTimeUpdate.stop_sequence) && stopIdsEqual)
          || (isNil(stopTimeUpdate.stop_id) && stopSequenceEqual)) {
            acc.push(stopTimeUpdate);
          }
      });
    }
    return acc;
  }, []);
}

export function augmentStopTimesWithRealtime(
    times: StopTimesQueryResult[],
    rt: GtfsRealtimeFeed,
    timezone: string,
  ): StopTimesApiResult | undefined {
    if (times.length === 0) {
      return;
    }

    const resultTimes = sortBy(times.map((time): StopTime => {
      const updates = getStopTimeUpdates(time, rt);
      let delay = 0;
      let hasRealtimeUpdate = false;

      updates.forEach((update) => {
        if (isNotNil(update.departure) && isNotNil(update.departure.delay)) {
          delay = update.departure.delay;
          hasRealtimeUpdate = true;
        }
      });

      const deptTimeParts = time.scheduled_departure_time.split(':');
      const departureTime = moment().tz(timezone)
        .set('hour', parseInt(deptTimeParts[0], 10))
        .set('minute', parseInt(deptTimeParts[1], 10))
        .set('second', parseInt(deptTimeParts[2], 10))
        .add(delay, 'seconds');

      return {
        trip_id: time.trip_id,
        scheduled_departure_time: time.scheduled_departure_time,
        departure_mins: departureTime.diff(moment().tz(timezone), 'minutes'),
        realtime_offset: hasRealtimeUpdate ? delay : undefined,
      };
    }).filter((stopTime: StopTime) => {
      return stopTime.departure_mins >= 0;
    }), 'departure_mins');

    return {
      stop_name: times[0].stop_name,
      route_id: times[0].route_id,
      stop_sequence: times[0].stop_sequence,
      stop_id: times[0].stop_id,
      service_id: times[0].service_id,
      times: resultTimes,
    }
}
