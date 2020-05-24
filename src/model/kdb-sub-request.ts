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
    select_cols: any;
    where_cols: string[];
    grouping_col: string;

}

export class LiveStreamReqDictionary {
    [id:string]: Array<KdbSubscriptionRequest>
}

export const liveSubscriptionRequest: string =  ' {[dict] \n ' +
' '