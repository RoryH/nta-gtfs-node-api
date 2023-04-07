import express from 'express';
import { isNil, isNotNil, isString } from '@flowio/is';
import { getRouteTimezone, getStopTimes, getStopsByRoute, getRoutes } from './queries';
import {
  AppCacheRouteEntry,
  type RealtimeStore,
  type StopTimesApiResult,
  type StopsByRouteApiResult,
  type StopsByRouteQueryResult,
  type TypedResponse,
} from './types';
import { type Database } from 'sqlite';
import { augmentStopTimesWithRealtime, getRouteId, getShortRouteName } from './utilities';
import { SERVER_PORT } from './constants';
import sortBy from 'lodash/sortBy';
import { getAgencies } from 'gtfs';

export async function initApi(db: Database, app: express.Application, rts: RealtimeStore) {
  app.get('/getAgencies', async function (req, res) {
    res.json(await getAgencies());
  });

  app.get('/getStopsByRoute', async function (req: express.Request, res: TypedResponse<StopsByRouteApiResult>) {
    if (isString(req.query.route)) {
      const results = await getStopsByRoute(getRouteId(app, req.query.route.toUpperCase()), db);
      const reduced = results.reduce<StopsByRouteQueryResult[][]>((acc, stop) => {
        acc[stop.direction_id].push(stop);
        return acc;
      }, [[], []]);

      res.json({
        route_id: getRouteId(app, req.query.route),
        route_short_name: req.query.route,
        directions: reduced.map((direction) => sortBy(direction, ['stop_sequence'])),
      });
      return;
    }
    res.status(422).json({ error: 'Missing parameter [route]' });
    return;
  });

  app.get('/getStopTimes', async function(req: express.Request, res: TypedResponse<StopTimesApiResult>) {
    if (isString(req.query.stop_id) && isString(req.query.route)) {
      let routeTimezone: string | undefined;
      try {
        routeTimezone = await getRouteTimezone(getRouteId(app,req.query.route.toUpperCase()), db);
      }
      catch(e: unknown) {
        res.status(500).send({ error: e instanceof Error? e.message : '/getStopTimes is broken.' });
        return;
      }

      if (isNil(routeTimezone)) {
        res.status(500).send({ error: 'Failed to determine route timezone.' });
        return;
      }

      const result = await getStopTimes(db, getRouteId(app, req.query.route.toUpperCase()), req.query.stop_id);
      const formattedTimes = augmentStopTimesWithRealtime(result, rts.get(), routeTimezone);
      if (isNil(formattedTimes)) {
        res.status(404).json({ error: 'NO_TIMES_FOUND' });
      }
      res.json(augmentStopTimesWithRealtime(result, rts.get(), routeTimezone));
      return;
    }
    res.status(422).json({ error: 'Missing parameters [stop_id] and/or [route]' });
    return;
  });

  app.get('/getRealTimeSummary', async function(req: express.Request, res: express.Response) {
    const rt = rts.get();
    res.send(rt.entity.reduce((acc, entity) => {
      const tripUpdate = entity.trip_update;
      if (isNotNil(tripUpdate)) {
        const timeUpdate = tripUpdate.stop_time_update;
        if (isNotNil(timeUpdate)) {
          const shortRouteId = getShortRouteName(app, tripUpdate.trip.route_id);
          if (isNotNil(shortRouteId)) {
            acc[shortRouteId] = [
              ...(acc[shortRouteId] || []),
              tripUpdate.trip.trip_id,
            ];
          }
        }
      }
      return acc;
    }, {} as Record<string, string[]>));
  });

  app.get('/rt', async function(req, res) {
    res.json(rts.get());
  });

  app.get('/getRoutes', async function(req, res) {
    res.send((await getRoutes(db)).reduce<Record<string, AppCacheRouteEntry>>((acc, routeEntry) => {
      acc[routeEntry.route_short_name] = {
        id: routeEntry.route_id,
        agency: routeEntry.agency_name,
      };
      return acc;
    }, {}));
  })

  app.listen(SERVER_PORT);
}