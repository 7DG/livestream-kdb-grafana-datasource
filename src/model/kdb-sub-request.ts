import {kdbEpoch} from './kdb-request-config'

export class KdbSubscriptionRequest {

    time: string;
    refId: string;
    panelId: string;
    subscription: KdbSubscription;
    format: string;
    version: string;

}

export class KdbSubscription {

    table: string;
    temporal_col: string;
    select_cols: string[];
    where_cols: string[];
    grouping_col: string;

}

export const liveSubscriptionRequest: string =  ' {[dict] \n ' +
' '