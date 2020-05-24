import { KdbRequest } from "./model/kdb-request";
import { KdbSubscriptionRequest, KdbSubscription } from "./model/kdb-sub-request";
import { QueryParam } from "./model/query-param";
import { QueryDictionary } from "./model/queryDictionary";
import { ConflationParams } from "./model/conflationParams";
import { graphFunction } from './model/kdb-request-config';
import { tabFunction,defaultTimeout,kdbEpoch } from './model/kdb-request-config';

export class KDBBuilder {

    buildKdbRequest(target) {
        if (target.queryType == 'liveStreamQuery') return ["", {subscribePanel: true, refId: target.refId}]        ///////////////////////////////// LIVE STREAM DEV CODE /////////////////////
        let queryParam = new QueryParam();
        let kdbRequest = new KdbRequest();
        let queryDictionary = new QueryDictionary();
        let conflationParams = new ConflationParams();

        //Need to take into account quotes in line, replace " with \"
        queryDictionary.type = (target.queryType == 'selectQuery') ? '`select' : '`function';
        queryDictionary.value = target.kdbFunction;

        queryParam.query = Object.assign({}, queryDictionary);
        queryParam.queryId = target.queryId;
        queryParam.table = '`' + target.table;
        queryParam.column = this.buildColumnParams(target);
        queryParam.select_cols = this.LiveBuildColumnParams(target, "select");
        queryParam.temporal_field = target.useTemporalField ? this.buildTemporalField(target) : [];
        queryParam.temporal_range = this.buildTemporalRange(target.range);
        queryParam.maxRowCount = target.rowCountLimit
        if (target.queryType == 'selectQuery') queryParam.where = this.buildWhereParams(target.where);
        //conflation
        if (target.useConflation) {
            conflationParams.val = target.conflationDurationMS.toString();
            conflationParams.agg = target.conflationDefaultAggType;
            queryParam.conflation = Object.assign({}, conflationParams);
        }
        else {
            queryParam.conflation = [];
        }

        //add condition, has grouping been selected?
        if (target.useGrouping && target.queryType == 'selectQuery' && target.groupingField) {
            queryParam.grouping = [('`' + target.groupingField)];
        }
        else  if (target.useGrouping && target.queryType == 'functionQuery' && target.funcGroupCol) {
            queryParam.grouping = [('`' + target.funcGroupCol)];
            
        }
        else {
            queryParam.grouping = [];
        }

        kdbRequest.time = this.getTimeStamp(new Date());
        kdbRequest.refId = target.refId;
        kdbRequest.query = ''//query;
        kdbRequest.queryParam = Object.assign({}, queryParam);
        kdbRequest.format = target.format;
        kdbRequest.queryId = target.queryId;
        kdbRequest.version = target.version;

        return [
            ((target.format == 'time series') ? graphFunction : tabFunction),
            Object.assign({}, kdbRequest)];
    }

    buildKdbSubscriptionRequest(target) {
        let kdbSubscriptionRequest = new KdbSubscriptionRequest();
        let subscription = new KdbSubscription();
        //let conflationParams = new ConflationParams();

        subscription.table = '`' + target.liveTable;
        subscription.select_cols = this.LiveBuildColumnParams(target, "liveSelect");
        subscription.temporal_col = target.useTemporalField ? this.buildTemporalField(target) : '';
        //subscription.temporal_range = this.buildTemporalRange(target.range);
        //subscription.maxRowCount = target.rowCountLimit
        //subscription.where_cols = this.buildWhereParams(target.where);
        subscription.where_cols = []
        //conflation
        /* if (target.useConflation) {
            conflationParams.val = target.conflationDurationMS.toString();
            conflationParams.agg = target.conflationDefaultAggType;
            subscription.conflation = Object.assign({}, conflationParams);
        }
        else {
            subscription.conflation = [];
        } */

        //add condition, has grouping been selected?
        if (target.useLiveGrouping && target.liveGroupingField) {
            subscription.grouping_col = ('`' + target.liveGroupingField);
        }

        kdbSubscriptionRequest.time = this.getTimeStamp(new Date());
        kdbSubscriptionRequest.refId = target.refId;
        kdbSubscriptionRequest.format = target.format;
        kdbSubscriptionRequest.subscription = subscription;
        kdbSubscriptionRequest.panelId = target.queryId;
        kdbSubscriptionRequest.version = target.version;

        //this.LiveStreamReqDictionary[target.refId] = kdbSubscriptionRequest;

        return ['`.grafLiveWS.subreq', Object.assign({}, kdbSubscriptionRequest)];
    };

    buildKdbSubscriptionCancel(target) {
        class kdbCancelRequest {
            refId: string;
            panelId: string;
        }
        let kdbCancelRequestDict = new kdbCancelRequest()
        kdbCancelRequestDict.refId = target.refId;
        kdbCancelRequestDict.panelId = target.queryId;

        return ['`.grafLiveWS.subend', Object.assign({}, kdbCancelRequestDict)]
    };

    private buildTemporalField(queryDetails) {
        if(queryDetails.queryType == 'selectQuery' && queryDetails.timeColumn) {
            return ('`' + queryDetails.timeColumn);
        } else if (queryDetails.queryType == 'functionQuery' && queryDetails.funcTimeCol) {
            return ('`' + queryDetails.funcTimeCol);
        } else if (queryDetails.queryType == 'liveStreamQuery' && queryDetails.liveTimeColumn) {
            return ('`' + queryDetails.liveTimeColumn);
            //if (queryDetails.useConflation == false) {
                //let returnDict = {}
                //returnDict['`' + queryDetails.liveTimeColumn] = ('`' + queryDetails.liveTimeColumn);
                //return returnDict;
            //} else {
            //    return [];
            //}
        }
        else {
            return '';
        };
    };

    private buildKdbTimestamp(date : Date) {
        return 1000000 * (date.valueOf() - kdbEpoch);
    }

    private buildTemporalRange(range) {
        let temporalRange: number[] = [];
        if (range) {
            temporalRange.push(this.buildKdbTimestamp(range.from._d));
            temporalRange.push(this.buildKdbTimestamp(range.to._d));
        }
        return temporalRange;
    };

    private buildWhereParams(queryWhereList): Array<string> {
        let whereArray = [];
        let whereClause = [];

        if (queryWhereList.length > 0) {
            queryWhereList.forEach(clause => {
                let notStatement = false
                if(clause.params[0] !== 'select field' && clause.params[2] !== 'enter value') {
                    whereClause = [];
                    if(clause.params[1].substr(0,3) == "not") {
                        clause.params[1] = clause.params[1].substr(4)
                        whereClause.push(clause.params[1]);
                        notStatement = true
                    } else whereClause.push(clause.params[1]);
                    whereClause.push('`' + clause.params[0]);
                    if (clause.datatype == 's') {
                        if (clause.params[1] == "in") {
                            whereClause.push(clause.params[2].split(",").map(str => "`"+str.trim()))
                        } else if (clause.params[1] == "like") {
                            whereClause.push('\"' + clause.params[2] + '\"');
                        } else
                        whereClause.push('`' + clause.params[2]);
                    }
                    else if (clause.datatype == 'c') {
                        whereClause.push('\"' + clause.params[2] + '\"');
                    }
                    else {
                        if (clause.params[1] == "within") {
                            whereClause.push(clause.params[2].split(",").map(str => str.trim()))
                        } else whereClause.push(clause.params[2]);
                    }
                    if (notStatement === true) {
                        whereClause.push("x")
                    } else whereClause.push("o") 
                    whereArray.push(whereClause);
                }
            })
        }

        return whereArray;
    }//end of building of where clause

    //Builds the list of select functions consisting of the column name and an aggregation function where applicable
    buildColumnParams(target): Array<string> {
        let columnArray: any[] = [];
        console.log('target.select', target.select)
        target.select.forEach(select => {
            if (select[0].params[0] !== 'select column') {
                let selectElement = [];
                if (target.useConflation) {
                    if (select.length !== 1) {
                        if (select[1].type == 'aggregate') {
                            selectElement.push(select[1].params[0]);
                        }
                        else {
                            selectElement.push(target.conflationDefaultAggType);
                        }
                    }
                    else {
                        selectElement.push(target.conflationDefaultAggType);
                    }
                }
                else {
                    selectElement.push('::'); //dummy value for kdb function
                }
                selectElement.push('`' + select[0].params[0]);

                //dealing with aliasing
                let alias = '::';
                if (select.length > 1) {
                    if (select[1].type == 'alias') {
                        alias = select[1].params[0];
                    }
                }
                if (select.length == 3) {
                    if (select[2].type == 'alias') {
                        alias = select[2].params[0];
                    }
                }

                selectElement.push(alias);
                columnArray.push(selectElement);
            }

        });
        return columnArray;
    }

    LiveBuildColumnParams(target, selectObj: string): any {
        let outSelect = {};
        target[selectObj].forEach(select => {
            let typeArr = [];
            let datatypeArr = [];
            let paramsArr = [];
            for (let i = 0; i < select.length;i++) {
                typeArr.push(select[i].type);
                datatypeArr.push(select[i].datastype);
                paramsArr.push(select[i].params);
            };
            let selectComponent = {};
            for (let p = 0; p < typeArr.length; p++) {
                if (typeArr[p] == "column") selectComponent["col"] = '`' + paramsArr[p][0];
                else if (typeArr[p] == "aggregate") selectComponent["agg"] = paramsArr[p][0];
                else if (typeArr[p] == "alias") selectComponent["name"] = paramsArr[p][0];
            };
            if(target.useConflation && selectComponent["agg"] === undefined) {
                selectComponent["agg"] = target.conflationDefaultAggType;
            } else {
                selectComponent["agg"] = '::';
            };

            if(selectComponent["name"] === undefined) {
                selectComponent["name"] = selectComponent["col"]
            }

            outSelect[selectComponent["name"].substr(1)] = [selectComponent["agg"], selectComponent["col"]];

        });
        return outSelect;
    }

    private getTimeStamp(date: Date): string {
        let dateString = date.valueOf().toString();
        return dateString.substring(0, dateString.length - 3);
    }
}