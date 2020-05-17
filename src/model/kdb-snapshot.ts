export class KdbSnapshot {

    table: string;
    temporal_col: string;
    temporal_range: number[];
    where_cols: string[];
    grouping_col: string;
    select_cols: string[];
    maxRowCount: number;

}

export const liveSnapshot: string =  '{[dict] \n ' +
' ; \n ' +
' };'