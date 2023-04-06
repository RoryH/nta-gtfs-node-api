import express from 'express';
import { isNil, isString } from '@flowio/is';
import { getRouteTimezone, getStopTimes, getStopsByRoute } from './queries';
import {
  type RealtimeStore,
  type StopTimesApiResult,
  type StopsByRouteApiResult,
  type StopsByRouteQueryResult,
  type TypedResponse,
} from './types';
import { type Database } from 'sqlite';
import { augmentStopTimesWithRealtime } from './utilities';
import { APP_CONFIG_ROUTE_ID_MAP, SERVER_PORT } from './constants';
import sortBy from 'lodash/sortBy';
import { getAgencies } from 'gtfs';

function getRouteId(app: express.Application, routeShortName: string) {
  return app.get(APP_CONFIG_ROUTE_ID_MAP)[routeShortName];
}

export async function initApi(db: Database, app: express.Application, rts: RealtimeStore) {
  app.get('/getAgencies', async function (req, res) {
    res.json(await getAgencies());
  });

  app.get('/getStopsByRoute', async function (req: express.Request, res: TypedResponse<StopsByRouteApiResult>) {
    if (isString(req.query.route)) {
      const results = await getStopsByRoute(getRouteId(app, req.query.route), db);
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
        routeTimezone = await getRouteTimezone(getRouteId(app,req.query.route), db);
      }
      catch(e: unknown) {
        res.status(500).send({ error: e instanceof Error? e.message : '/getStopTimes is broken.' });
        return;
      }

      if (isNil(routeTimezone)) {
        res.status(500).send({ error: 'Failed to determine route timezone.' });
        return;
      }

      const result = await getStopTimes(db, getRouteId(app, req.query.route), req.query.stop_id);
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

  app.get('/rt', async function(req, res) {
    res.json(rts.get());
  });

  app.listen(SERVER_PORT);
}