import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { getAgencies } from 'gtfs';
import express from 'express';
import cron from 'node-cron';
import sortBy from 'lodash/sortBy';
import { existsSync } from 'fs';

import maybeImportGtfs from './import-gtfs';
import { readFile } from 'fs/promises';
import { GtfsConfig, GtfsRealtimeFeed, StopsByRouteApiResult, StopsByRouteQueryResult, StopTimesApiResult, TypedResponse } from './types';
import { isNil, isString } from '@flowio/is';
import { getRoutes, getRouteTimezone, getStopsByRoute, getStopTimes } from './queries';
import { refreshRealtimeData } from './realtime';
import { APP_CONFIG_ROUTE_ID_MAP, GTFS_REALTIME_CACHE_FILENAME, SERVER_PORT } from './constants';
import { augmentStopTimesWithRealtime } from './utilities';

async function openDb(config: GtfsConfig) {
  sqlite3.verbose();

  const db =  await open({
    filename: config.sqlitePath,
    driver: sqlite3.cached.Database,
  });

  if (process.env.DEBUG === 'true') {
    db.on('trace', (sql: string) => {
      console.log(`DB query:
      -------------------------------
      ${sql}
      -------------------------------`);
    });
  }

  return db;
}

async function initApi(db: Database, app: express.Application, rts: RealtimeStore) {
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

type RealtimeStore = {
  set: (data: GtfsRealtimeFeed) => void;
  get: () => GtfsRealtimeFeed;
}

function initRealtimeStore(app: express.Application): RealtimeStore {
  return {
    set: (data: GtfsRealtimeFeed) => {
      app.set('realtimeData', data);
    },
    get: (): GtfsRealtimeFeed => {
      return app.get('realtimeData');
    }
  };
}

async function initRouteLookupCache(db: Database, app: express.Application) {
  return getRoutes(db).then((routes) => {
    app.set(APP_CONFIG_ROUTE_ID_MAP, routes.reduce<Record<string, string>>((acc, routeEntry) => {
      acc[routeEntry.route_short_name] = routeEntry.route_id;
      return acc;
    }, {}));
    console.log('set application routes lookup table');
  });
}

function getRouteId(app: express.Application, routeShortName: string) {
  return app.get(APP_CONFIG_ROUTE_ID_MAP)[routeShortName];
}

async function fetchRealtimeData(store: RealtimeStore) {
  return refreshRealtimeData().then((result) => {
    if (!isNil(result)) {
      store.set(result);
    }
  }).catch((e: unknown) => {
    console.error(`refreshRealtimeData() failed: ${e instanceof Error ? e.message: 'unknown error' }`);
  });
}

function initCron(store: RealtimeStore) {
  if (existsSync(GTFS_REALTIME_CACHE_FILENAME)) {
    readFile(GTFS_REALTIME_CACHE_FILENAME, 'utf8').then((data) => {
      store.set(JSON.parse(data));
    });
  }
  cron.schedule('* * * * *', async () => {
    fetchRealtimeData(store);
  });
}


async function init() {
  const config: GtfsConfig = JSON.parse(
    await readFile('./gtfs-config.json', 'utf8'),
  );
  await maybeImportGtfs(config);
  const db = await openDb(config);
  const app = express();
  initRouteLookupCache(db, app);
  const realtimeStore = initRealtimeStore(app);
  initCron(realtimeStore);
  initApi(db, app, realtimeStore);
}

init();

export default {};