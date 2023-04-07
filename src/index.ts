import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import express from 'express';
import Cron from 'croner';
import { existsSync } from 'fs';
import cors from 'cors';

import maybeImportGtfs from './import-gtfs';
import { readFile } from 'fs/promises';
import { AppCacheRouteEntry, GtfsConfig, GtfsRealtimeFeed, RealtimeStore } from './types';
import { isNil } from '@flowio/is';
import { getRoutes } from './queries';
import { refreshRealtimeData } from './realtime';
import { APP_CONFIG_ROUTE_ID_MAP, GTFS_REALTIME_CACHE_FILENAME } from './constants';
import { initApi } from './api';

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
  return await getRoutes(db).then((routes) => {
    app.set(APP_CONFIG_ROUTE_ID_MAP, routes.reduce<Record<string, AppCacheRouteEntry>>((acc, routeEntry) => {
      acc[routeEntry.route_short_name] = {
        id: routeEntry.route_id,
        agency: routeEntry.agency_name,
      };
      return acc;
    }, {}));
    console.log('set application routes lookup table');
  });
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
  setTimeout(() => {
    // run after 1 min as otherwise API will rate limit call.
    Cron('0 * * * * *', () => {
      fetchRealtimeData(store);
    });
  }, 60000);
}


async function init() {
  const config: GtfsConfig = {
    verbose: process.env.NODE_ENV !== 'production',
    ...JSON.parse(
      await readFile('./gtfs-config.json', 'utf8'),
    ),
  };
  await maybeImportGtfs(config);
  const db = await openDb(config);
  const app = express();
  app.use(cors())
  await initRouteLookupCache(db, app);
  const realtimeStore = initRealtimeStore(app);
  // fetch on startup
  fetchRealtimeData(realtimeStore);
  initCron(realtimeStore);
  initApi(db, app, realtimeStore);
}

init();

export default {};