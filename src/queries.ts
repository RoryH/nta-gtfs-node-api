import { isNotNil } from '@flowio/is';
import memoize from 'lodash/memoize';
import moment from 'moment-timezone';
import { Database } from 'sqlite';
import type { RoutesQueryResult, StopsByRouteQueryResult, StopTimesQueryResult } from './types';

export const getRouteTimezone = memoize(async (routeId: string, db: Database) => {
  return await db.get<{ agency_timezone: string }>(`
    SELECT a.agency_timezone
    FROM agency AS a
    JOIN routes r
    ON r.agency_id = a.agency_id AND r.route_id = ?
  `, [
    routeId,
  ]).then((data) => {
    if (isNotNil(data)) {
      return data.agency_timezone;
    }
  })
});

export const getStopsByRoute = memoize(async function(routeId: string, db: Database) {
    return await db.all<StopsByRouteQueryResult[]>(`
    SELECT s.stop_id, s.stop_code, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence, t.direction_id
    FROM trips AS t
    JOIN
    stop_times AS st
    ON t.trip_id=st.trip_id AND route_id = ?
    JOIN stops AS s
    ON st.stop_id=s.stop_id
    GROUP BY s.stop_id, s.stop_name
    ORDER BY st.stop_sequence
      `, [
        routeId,
      ]);
});


export const getStopTimes = async function(db: Database, routeId: string, stopId: string) {
  const timezone = await getRouteTimezone(routeId, db);
  if (isNotNil(timezone)) {
    const dayOfWeek = moment().tz(timezone).format('dddd').toLowerCase();
    const todaysDate = moment().tz(timezone).format('YYYYMMDD').toLowerCase();
    return await db.all<StopTimesQueryResult[]>(`
      SELECT DISTINCT st.departure_time as scheduled_departure_time, s.stop_name, s.stop_code, t.route_id, st.stop_sequence, st.stop_id, t.trip_id, t.trip_headsign
        FROM trips AS t
      JOIN calendar AS c ON c.service_id = t.service_id AND c.${dayOfWeek} = 1
      JOIN calendar_dates AS cd on cd.service_id = t.service_id AND cd.service_id NOT IN (
        -- The NTA data seems to have duplicate trips in the dataset, but excluded by the following calendar_dates data :-/
        SELECT service_id FROM calendar_dates AS cd WHERE service_id=t.service_id AND cd.date = "${todaysDate}" AND cd.exception_type = 2
      )
      JOIN stop_times AS st ON t.trip_id=st.trip_id AND route_id = ?
      JOIN stops AS s ON st.stop_id=s.stop_id AND s.stop_id = ?
      ORDER BY st.departure_time ASC
    `, [
      routeId,
      stopId,
    ]);
  }
  throw new Error('No timezone found for route');
};

export const getRoutes = async function(db: Database) {
  return await db.all<RoutesQueryResult[]>(`
    SELECT r.route_id, r.route_short_name, a.agency_name from routes AS r JOIN agency as a ON a.agency_id = r.agency_id;
  `);
}