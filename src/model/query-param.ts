import {QueryDictionary} from "./queryDictionary";

export class QueryParam {

    table: string;
    column: any[] = [];
    where: string[] = [];
    temporal_field: any;
    temporal_range: number[] = [];
    grouping: string[] = [];
    conflation: any;
    query: QueryDictionary;
    queryId: string;
    maxRowCount: number;

    ///////////////// LIVE STREAM DEV ///////////
    liveTable: string;
    liveColumn: any[] = [];
    liveWhere: string[] = [];
    liveTemporal_field: any;
    ///////////////END OF LIVE STREAM DEV ////////
}