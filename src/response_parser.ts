///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
import _ from 'lodash';
import angular from 'angular';
import table_model from 'app/core/table_model';
import { Datasource } from 'dist/module';

export default class ResponseParser {
    constructor(private $q) {
    }

    processQueryResult(res: any, req: any) {
        let data = {};
        if (!res) return data;
        //KDB+ Error Handling
        if (res.success === false) {
            let errorMessage : string = res.error;

            let meta = {
                errorReceived:true,
                errorMessage: errorMessage
            }
            let errorReturn = {
                refId: req[1].refId,
                columns: [],
                rows: [],
                meta
            }
            return [errorReturn];
        };

        if (req[1].format=='time series') {
            data = this.mapGraphData(res, req);
        } else {
            data = this.mapTableData(res, req);
        }
        return data;
    }

    //////////////////////////////// LIVE STREAM DEV CODE ////////////////////////////////

    subscriptionResponse(res: any) {
        //Ideally alert with green notice that data correctly subscribed
        if (res.success) {
            console.log('DATA CORRECTLY SUBSCRIBED/CANCELLED', res);
            return true
        } else {
            console.log('DATA FAILED TO SUBSCRIBE/CANCEL', res);
            return false
        };
    }
    //////////////////////////// END OF LIVE STREAM DEV CODE /////////////////////////////

    mapTableData(res,req){

        let dataObjectList = [];

        let table = {
            columns: [],
            rows : [],
            type: 'table',
            refId: req[1].refId,
            meta: req[1]
        }

        let temporalFieldInc = (typeof req[1].queryParam.temporal_field == 'string') ? true : false;
        //looping through to add the results to the returned value and update the names
        if (req[1].queryParam.query.type == '`function') {
            for (let col = 0; col < res.payload.columns[0].length; col++) {
                table.columns.push(res.payload.columns[0][col])
                if ('`' + res.payload.columns[0][col].text == req[1].queryParam.temporal_field) {
                    table.columns[col].text = 'Time'
                    table.columns[col].alias = req[1].queryParam.temporal_field.replace( '`', '');
                }

            }
        }
        else 
        {
            for (let col = 0; col < res.payload.columns[0].length; col++) {
                table.columns.push(res.payload.columns[0][col])
                if (temporalFieldInc) {
                    if (col === 0) {
                        table.columns[col].text = 'Time'
                        table.columns[col].alias = req[1].queryParam.temporal_field.replace( '`', '');
                    } else {
                        table.columns[col].text = req[1].queryParam.column[col - 1][2] == '::' ? req[1].queryParam.column[col - 1][1] :req[1].queryParam.column[col - 1][2];
                    }

                } else {
                    table.columns[col].text = req[1].queryParam.column[col][2] == '::' ? req[1].queryParam.column[col][1] :req[1].queryParam.column[col][2];  
                }
            }
        }

        res.payload.rows[0].forEach(function (rowLoop) {
            let curRow = [];
            for (let col = 0; col < res.payload.columns[0].length; col ++) {
                if (temporalFieldInc || col == 0){
                    curRow.push(rowLoop[col].valueOf());
                }
                else {
                    curRow.push(rowLoop[col]);
                }
            }         
            //dataObj.rows.push(curRow);
            table.rows.push(curRow);
        })

        dataObjectList.push(table);
        return dataObjectList;
    }

    mapGraphData(res, req) {
        let response = res;
        var dataObjList = [];
        let targetName: string = 'x'
        var colKeys = Object.keys(response.payload[1][0].data[0]);
        var grpKeys = Object.keys(response.payload[0][0]);
        
        //looop for each grouping(sym)*************
        for (let g = 0; g < response.payload[0].length; g++) {
            var curCol = 2;
            //looping through columns if multiple have been selected
            for (curCol = 2; curCol <= colKeys.length; curCol++) {
                var fieldName = (req[1].queryParam.query.type == "`select") ? req[1].queryParam.column[curCol - 2][1] : colKeys[curCol - 1];

                if(req[1].queryParam.query.type == "`select" && req[1].queryParam.column[curCol - 2][2] !== '::') {
                   fieldName = req[1].queryParam.column[curCol - 2][2]
                }

                if (response.payload[0][g][grpKeys[0]].toString() == 'x') {
                    targetName = fieldName;
                }
                else {
                    targetName = response.payload[0][g][grpKeys[0]].toString() + ' - ' + fieldName;
                }

                let dataObj = {
                    target: targetName,
                    datapoints: [],
                    refId: req[1].refId,
                    meta: req[1]
                };

            //response.payload.....poll object for names, then this
            var dataList = [];
            var timeList = [];

            response.payload[1][g].data.forEach(function (value) {
                timeList.push(value[colKeys[0]])
                dataList.push(value[colKeys[curCol - 1]])
            });
            //conform object to datapoint
            for (let i = 0; i < dataList.length; i++) {
                let dataPoint = [dataList[i], timeList[i].valueOf()];
                dataObj.datapoints.push(dataPoint);
            }
            dataObjList.push(dataObj);

            }
        }
        console.log('MAPGRAPHOUT', dataObjList);
        return dataObjList;
    }

    mapSubscriptionData(keycol, dataList, req) {
        var dataObjList = [];
        let grpBy = Object.keys(keycol)[0];
        let dataKey = keycol[grpBy];
        let groupingBool = req.subscription.grouping_col != [];
        let datapointCols = Object.keys(dataList.data[0]);
        let timeColName = datapointCols[0];
        let dataColNames = datapointCols.splice(1, datapointCols.length - 1);

        for(var col_ind = 0; col_ind < dataColNames.length; col_ind++) {
            var series = {}
            series["refId"] = req.refId;
            series["meta"] = req;
            groupingBool ? series["target"] = dataKey + ' - ' + dataColNames[col_ind] : series["target"] = dataColNames[col_ind];
            series["datapoints"] = []
            dataList.data.forEach(row => {
                series["datapoints"].push([row[dataColNames[col_ind]], row[timeColName].valueOf()])
            })
            dataObjList.push(series);
        }
        console.log('MAPSUBSCRIPTIONOUT', dataObjList);
        return dataObjList
    }

}
