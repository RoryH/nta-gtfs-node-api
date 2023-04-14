import { Response } from 'express';
import { Send } from 'express-serve-static-core';

export type RealtimeStore = {
    set: (data: GtfsRealtimeFeed) => void;
    get: () => GtfsRealtimeFeed;
}

type GtfsAgency = {
    path: string;
}

type ScheduleRelationship = 'SCHEDULED' | 'SKIPPED' | 'NO_DATA';

export type GtfsConfig = {
    agencies: GtfsAgency[];
    sqlitePath: string;
    verbose: boolean;
}

type GtfsRealtimeTripUpdate = {
    trip: GtfsRealtimeTrip;
    stop_time_update?: GtfsRealtimeStopTimeUpdate[];
}

type GtfsStopTimeEvent = {
    delay?: number;
    time?: number;
    uncertainty?: number;
}

export type GtfsRealtimeStopTimeUpdate = {
    stop_sequence?: number;
    arrival?: GtfsStopTimeEvent;
    departure?: GtfsStopTimeEvent;
    stop_id?: string;
    schedule_relationship: ScheduleRelationship;
}

type GtfsRealtimeTrip = {
    trip_id: string;
    start_time: string;
    start_date: string;
    schedule_relationship: ScheduleRelationship;
    route_id: string;
}

export type GtfsRealtimeEntity = {
    id?: string;
    trip_update?: GtfsRealtimeTripUpdate;
}

export type GtfsRealtimeFeed = {
    header: {
        gtfs_realtime_version: string;
        timestamp: number;
    };
    entity: GtfsRealtimeEntity[];
}


export type StopTimesQueryResult = {
    scheduled_departure_time: string;
    stop_name: string;
    route_id: number;
    stop_id: string;
    trip_id: string;
    trip_headsign: string;
    service_id: string;
    stop_sequence: number;
};

export type StopTimesApiResult = Omit<StopTimesQueryResult, 'scheduled_departure_time' | 'trip_id' | 'trip_headsign'> & {
    times: StopTime[];
}

export type StopTime = Pick<StopTimesQueryResult, 'scheduled_departure_time'> & {
    departure_mins: number;
    trip_id: string;
    destination: string;
    realtime_offset?: number;
};


export type StopsByRouteQueryResult = {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    stop_sequence: number;
    direction_id: number;
};

export type StopsByRouteApiResult = {
    route_id: string;
    route_short_name: string;
    directions: StopsByRouteQueryResult[][];
}

 export type RoutesQueryResult = {
    route_id: string;
    route_short_name: string;
    agency_name: string;
};

export type AppCacheRouteEntry = {
    id: string;
    agency: string;
}

type ErrorResponse = {
    error: string;
}

export interface TypedResponse<ResBody> extends Response { json: Send<ResBody | ErrorResponse, this>;}