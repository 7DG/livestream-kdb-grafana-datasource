///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
import _ from 'lodash';
import ResponseParser from './response_parser';
import KDBQuery from './kdb_query';
//import {KDBMetaQuery} from './meta_query';
import { C } from './c';
import { KdbRequest } from "./model/kdb-request";
import { KdbSubscriptionRequest, KdbSubscription } from "./model/kdb-sub-request";
import { QueryParam } from "./model/query-param";
import { QueryDictionary } from "./model/queryDictionary";
import { ConflationParams } from "./model/conflationParams";
import { graphFunction } from './model/kdb-request-config';
import { tabFunction,defaultTimeout,kdbEpoch } from './model/kdb-request-config';
import { KDBBuilder } from './query_build';

/* interface LiveStreamDataID {
    [id: string]: string
};
interface LiveStreamDataData {
    data: any[]
}
export class LiveStreamDataDictionary {
    [id: string]: Array<LiveStreamDataID[] | LiveStreamDataData[]>
} */

export class KDBDatasource {
    //This is declaring the types of each member
    id: any;
    name: any;
    responseParser: ResponseParser;
    queryModel: KDBQuery;
    queryBuilder: KDBBuilder;
    interval: string;
    message = {};
    url: string;
    wsUrl: string;
    ws: WebSocket;
    awaitingResponse: boolean;
    c: C = new C();
    maxRowCount: number;
    connectionStateCycles: number;
    timeoutLength: number;

    /////////////////////////////// LIVE STREAM DEV CODE /////////////////////////
    LiveStreamDataDictionary: any;
    LiveStreamReqDictionary: any;

    /////////////////////////// END OF LIVE STREAM DEV CODE /////////////////////////

    //WebSocket communication variables
    requestSentList: any[];
    requestSentIDList: any[];
    responseReceivedList: any[];

    /** @ngInject */
    constructor(instanceSettings, private backendSrv, private $q, private templateSrv) {
        this.name = instanceSettings.name;
        this.id = instanceSettings.id;
        this.responseParser = new ResponseParser(this.$q);
        this.queryModel = new KDBQuery({});
        this.queryBuilder = new KDBBuilder();
        this.interval = (instanceSettings.jsonData || {}).timeInterval;
        if (!instanceSettings.jsonData.timeoutLength) {
            this.timeoutLength = defaultTimeout
        } else {
            this.timeoutLength = Number(instanceSettings.jsonData.timeoutLength)
        };
        this.requestSentList = [];
        this.requestSentIDList = []
        this.responseReceivedList = [];

        this.LiveStreamDataDictionary = {};
        this.LiveStreamReqDictionary = {};

        this.url = 'http://' + instanceSettings.jsonData.host;
        if (instanceSettings.jsonData.useAuthentication) {
            if(instanceSettings.jsonData.useTLS === true) {
                this.wsUrl = 'wss://' + instanceSettings.jsonData.user + ':' + instanceSettings.jsonData.password + '@' + instanceSettings.jsonData.host;
            } else {
                this.wsUrl = 'ws://' + instanceSettings.jsonData.user + ':' + instanceSettings.jsonData.password + '@' + instanceSettings.jsonData.host;
            }
        }
        else {
            this.wsUrl = 'ws://' + instanceSettings.jsonData.host;
        };

    }

    /* interpolateVariable = (value, variable) => {
        if (typeof value === 'string') {
            if (variable.multi || variable.includeAll) {
                return this.queryModel.quoteLiteral(value);
            } else {
                return value;
            }
        }

        if (typeof value === 'number') {
            return value;
        }

        const quotedValues = _.map(value, v => {
            return this.queryModel.quoteLiteral(v);
        });
        return quotedValues.join(',');
    }; */

    showEmpty(Id: string, errormessage?: string) {
    
        if (typeof errormessage === 'undefined') {
        var returnobj = {
            refId: Id,
            columns: [],
            rows: [],
            meta: {refId: Id, errorReceived:false, errorMessage: ""}
        }} else {
            var returnobj = {
                refId: Id,
                columns: [],
                rows: [],
                meta: {refId: Id, errorReceived:true, errorMessage: errormessage}
            }
        }
        return returnobj   
    };

    errorReturn(errorstring: string) {
        return {payload:[],error:errorstring,success:false}
    };

    query(options) {
        console.log('QUERY OPTIONS: ', options)
        var prefilterResultCount = options.targets.length;
        var allRefIDs = [];
        var blankRefIDs = [];
        var validRequestList = [];
        var errorList = [];

        ///////////////////////////////////////////// LIVE STREAM DEV CODE ////////////////////////////////////////////////


        ///////////////////////////////////////// END OF LIVE STREAM DEV CODE /////////////////////////////////////////////

        for(var i = 0; i < prefilterResultCount; i++){
            allRefIDs.push(options.targets[i].refId);
            options.targets[i].range = options.range;
            if ((!options.targets[i].table && options.targets[i].queryType === 'selectQuery') || 
                (options.targets[i].queryType === 'functionQuery' && options.targets[i].kdbFunction === "" ) ||
                (options.targets[i].hide === true)) {
                    blankRefIDs.push(options.targets[i].refId);
                } else if (!options.targets[i].queryError) {
                    blankRefIDs.push(options.targets[i].refId)
                } else if(options.targets[i].queryError.error.indexOf(true) !== -1) {
                    errorList.push({
                        refId: options.targets[i].refId,
                        errorMessage: options.targets[i].queryError.message[options.targets[i].queryError.error.indexOf(true)]
                    });
                } else validRequestList.push(options.targets[i])
        };

        var nrBlankRequests = blankRefIDs.length
        var requestList = validRequestList.map(target => {
            return this.queryBuilder.buildKdbRequest(target);
            });

        var nrRequests: number = requestList.length;

        if (!this.ws || this.ws.readyState > 1) return this.connectWS().then(connectStatus => {
            if (connectStatus === true && nrRequests > 0) return this.sendQueries(nrRequests, requestList, nrBlankRequests, blankRefIDs,errorList);
            else if (connectStatus === true && nrRequests === 0) return this.emptyQueries(nrBlankRequests, blankRefIDs, errorList);
            else return this.connectFail(prefilterResultCount, allRefIDs); 
        })
        else {return this.webSocketWait().then(() => {
                if (nrRequests > 0) return this.sendQueries(nrRequests, requestList, nrBlankRequests, blankRefIDs,errorList);
                else return this.emptyQueries(nrBlankRequests, blankRefIDs, errorList);
            })
        }
    };

    subscriptionQuery() {
        let dataArr = []
        let LiveKeys = Object.keys(this.LiveStreamDataDictionary);
        for (let i = 0; i < LiveKeys.length;i++) {
            for (let d = 0; d < this.LiveStreamDataDictionary[LiveKeys[i]][0].length;d++) {
                let keycol = this.LiveStreamDataDictionary[LiveKeys[i]][0][d];
                let datalist = this.LiveStreamDataDictionary[LiveKeys[i]][1][d];
                let req = this.LiveStreamReqDictionary[LiveKeys[i]][d];
                dataArr.push(this.responseParser.mapSubscriptionData(keycol, datalist, req))
            }
        }
    }

    subscriptionQueryRefId(requestRefId: string) {
        let dataArr = []
        if(Object.keys(this.LiveStreamDataDictionary).indexOf(requestRefId) == -1) {
            return [this.showEmpty(requestRefId, "No data could be found in cache for this query.")];
        };
        for (let d = 0; d < this.LiveStreamDataDictionary[requestRefId][0].length;d++) {
            let keycol = this.LiveStreamDataDictionary[requestRefId][0][d];
            let datalist = this.LiveStreamDataDictionary[requestRefId][1][d];
            let req = this.LiveStreamReqDictionary[requestRefId][d];
            dataArr.push(this.responseParser.mapSubscriptionData(keycol, datalist, req))
        }
        return dataArr
    }

    sendQueries(nrRequests,requestList,nrBlankRequests,blankRefIDs,errorList) {
        var curRequest: number = 0;
        var resultList = [];

            return new Promise(resolve => {
                
                this.ProcessData(curRequest,nrRequests,resultList,requestList).then(() => {
                    
                    for(var i = 0; i < nrBlankRequests; i++){
                        resultList.push(this.showEmpty(blankRefIDs[i]))
                    };
                    for(var i = 0; i < errorList.length; i++){
                        resultList.push(this.showEmpty(errorList[i].refId, errorList[i].errorMessage))
                    };
                    console.log({data: resultList});
                    resolve({data: resultList});

                }).catch(e => {
                });
            })
    };
    connectFail(prefilterResultCount, allRefIDs) {
            return new Promise(resolve => {
                let serverUnavailableResponse = [];
                for(var i = 0; i < prefilterResultCount; i++) {
                    serverUnavailableResponse.push(this.showEmpty(allRefIDs[i],"KDB+ server unavailable."))
                };
                resolve({data: serverUnavailableResponse});
            });
    };

    emptyQueries(nrBlankRequests,blankRefIDs,errorList) {
        return new Promise(resolve => {
            let resultList = [];
            for(var i = 0; i < nrBlankRequests; i++){
                resultList.push(this.showEmpty(blankRefIDs[i]))
            };
            for(var i = 0; i < errorList.length; i++){
                resultList.push(this.showEmpty(errorList[i].refId, errorList[i].errorMessage))
            };
            resolve({data: resultList})
        });
    };

    private ProcessData(curRequest, nrRequests, resultList, requestList) {
        return new Promise(resolve => {
            this.getQueryResult(requestList[curRequest]).then((result) => {
                var indicies = Object.keys(result);
                if (result.hasOwnProperty('meta.errorReceived')) {
                    resultList.push(result);
                }
                else {
                    for (let i = 0; i < indicies.length; i++) {
                        resultList.push(result[i]);
                    }
                }

                if (curRequest == (nrRequests - 1)) {
                    let returnVal = resultList;
                    resolve(returnVal);
                }
                else {
                    curRequest++;
                    resolve(this.ProcessData(curRequest, nrRequests, resultList, requestList));
                }
            })
        })
    }

    //Response parser called here**********************
    private getQueryResult = (request: any): Promise<Object> => {
        let timeoutError = "Query sent at " + new Date() + " timed out.";
        let malformedResError = "Malformed response. Check KDB+ WebSocket handler is correctly configured."
        console.log('REQUEST: ', request);                                              //////////////////////////// LIVE STREAM DEV INSPECTION ////////////////////////////
        if (request[1].subscribePanel) {
            
        };
        let response = new Promise(resolve => {
            if(request[1].subscribePanel) {
                resolve(this.subscriptionQueryRefId(request[1].refId))
            } else {
                this.executeAsyncQuery(request).then((result) => {
                    if (Object.keys(result).indexOf("payload") === -1) {
                        return resolve([this.showEmpty(request[1].refId, malformedResError)])
                    } else {
                        const processedResult = this.responseParser.processQueryResult(result, request);
                        console.log(result);                                                //////////////////////////// LIVE STREAM DEV INSPECTION ////////////////////////////
                        return resolve(processedResult);
                    }
                });
            }
        });
        let timeout = new Promise(resolve => {
            let wait =  setTimeout(() => {
                clearTimeout(wait);
                resolve([this.showEmpty(request[1].refId, timeoutError)]);
            }, this.timeoutLength)
        });
        return Promise.race([timeout, response])
    }

    sendSubscriptionRequest(target) {
        console.log('SEND SUB REQUEST LOCAL TARGET:', target)
        //Code for creating a new subscription
        let subReq = this.queryBuilder.buildKdbSubscriptionRequest(target);
        this.executeAsyncQuery(subReq).then(res => {
            this.responseParser.subscriptionResponse(res);
        })
    };
    
    cancelSubscription(target) {
        //Code for cancelling a single subscription
    }

    liveStreamDataReceived(res: any) {
        let IDarr = res.payload[0];
        let DATAarr = res.payload[1];
        for(let idx = 0; idx < IDarr; idx++) {
            let res_ind = this.LiveStreamDataDictionary[res.refId][0].indexOf(IDarr[idx]);
            if (res_ind == -1) {
                this.LiveStreamDataDictionary[res.refId][0].push(IDarr[idx]);
                this.LiveStreamDataDictionary[res.refId][1].push(DATAarr[idx])
            } else {
                this.LiveStreamDataDictionary[res.refId][1][res_ind].data.push(DATAarr[res_ind].data)
            }
        }
    }

    connectWS() {
        return new Promise (connected => {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer';
        this.ws.onmessage = (response) => {
            this.executeAsyncReceive(response);
        };

        this.ws.onopen = () => {
            connected(true);
        }
        
        this.ws.onclose = () => {
            connected(false)
        };
        
        this.ws.onerror = () => {
        };
    })
    }

    webSocketWait() {
        return new Promise (ready => {
            if (this.ws.readyState === 0) {
                setTimeout(() => ready(this.webSocketWait()), 20)
            } else ready()
        })
    }

    executeAsyncQuery(request: any) {
        var requestResolve;
        let _c = this.c;
        var requestPromise = new Promise(resolve => {
            let refIDn = Math.round(10000000 * Math.random());
            var wrappedRequest = {i:request, ID:refIDn};
            this.ws.send(_c.serialize(wrappedRequest));
            this.requestSentIDList.push(refIDn);
            requestResolve = resolve;
        });

        Object.assign(requestPromise, {resolve: requestResolve})
        let countSentList = this.requestSentList.length
        this.requestSentList.push(requestPromise);
        return this.requestSentList[countSentList]
        }

    executeAsyncReceive(responseObj) {
        let _c = this.c;
        let deserializedResult = _c.deserialize(responseObj.data);
        if (!deserializedResult.ID) {
            return console.log('received malformed data')
        //////////////////////////////// LIVE STREAM DEV CODE ////////////////////////////////
        } else if (deserializedResult.o.datarequest) {
            if (deserializedResult.o.datarequest == 'subscription') {
                return this.liveStreamDataReceived(deserializedResult.o);
            } else if (deserializedResult.o.datarequest == 'subscriptionRequest') {
                var requestNum = this.requestSentIDList.indexOf(deserializedResult.ID);
                this.requestSentList[requestNum].resolve(deserializedResult.o)
            } 
        //////////////////////////// END OF LIVE STREAM DEV CODE /////////////////////////////    
        } else if (this.requestSentIDList.indexOf(deserializedResult.ID) === -1) {
            return console.log('received unrequested data');
        } else {
            var requestNum = this.requestSentIDList.indexOf(deserializedResult.ID);
            this.requestSentList[requestNum].resolve(deserializedResult.o);
        }
    }

    metricFindQuery(kdbRequest: KdbRequest) {
        return new Promise((resolve, reject) => {
            resolve(this.executeAsyncQuery(kdbRequest).then((result) => {
                return result;
            }));
        });

    }

    //This is the function called by Grafana when it is testing a connection on the configuration page
    testDatasource() {
        return this.connect()
            .then((result) => {
                return result;
            });
    };

    connect(): Promise<Object> {
        return new Promise<Object>((resolve, reject) => {
            if ("WebSocket" in window) {
                this.$q.when(this.setupWebSocket()).then(setTimeout(() => {
                    resolve(this.checkConnectionState().then(result => {
                        //clearTimeout;
                        return result;
                    }));
                }, 2000));
            } else {
                resolve(this.buildResponse('Error', 'WebSocket not supported!', 'Error'));
            }
        })
    }

    //This checks the kdb+ connection state for the 'test connection' funciton
    checkConnectionState(): Promise<Object> {
        return new Promise(resolve => {
            return this.connectWS().then(connectStatus => {
                if (connectStatus === false) {
                    resolve(this.buildResponse('fail', 'Data source cannot be connected, if using authentication/TLS check settings as above.', 'Fail'))
                } else {
                    let timeout = new Promise(resolve => {
                        let wait = setTimeout(() => {
                            clearTimeout(wait);
                            resolve(this.buildResponse('fail', 'Web socket connections aren\'t configured correctly for Grafana on your kdb+ instance.  Please speak to your system administrator.', 'Fail'));
                        }, this.timeoutLength)
                    });
                    let response = new Promise(resolve => {
                        this.executeAsyncQuery('.z.ws').then(res => {
                            if (typeof res !== 'string') {
                                resolve(this.buildResponse('fail', 'Malformed response. Check KDB+ WebSocket handler is correctly configured.', 'Fail'));
                            } else if (res.replace(' ', '').includes('ds:-9!x;')) {
                                //if it looks like .z.ws is correctly configured then return success
                                resolve(this.buildResponse('success', 'Data source successfully connected!', 'Success'));
                            } else {
                                //If .z.ws hasn't been configured correctly on the database then return an error message
                                resolve(this.buildResponse('fail', 'Web socket connections aren\'t configured correctly for Grafana on your kdb+ instance.  Please speak to your system administrator.', 'Fail'));
                            }
                        });
                    });
                    return resolve(Promise.race([timeout, response]))
                }
            })
        })}

    setupWebSocket() {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
        };

        this.ws.onmessage = (messageEvent: MessageEvent) => {
        };

        this.ws.onclose = () => {
        };

        this.ws.onerror = () => {
        }
    }

    buildResponse(status: string, message: string, title: string) {
        return Promise.resolve({
            status,
            message,
            title
        });
    }

}
