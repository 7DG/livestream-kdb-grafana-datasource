//Code for using LiveStream query with Grafana adaptor

\d .grafLiveWS

subtable:([panelID:`long$()]        //Each user has their own subtable, each panel is one entry.
    tablename:`sym$();
    //temporalbool:`boolean$();
    temporal_col:`sym$();
    //temporalfrom:`timestamp$();
    //temporalto:`timestamp$();
    whereclause:();
    byclause:();
    selectclause:()
    );

subs:(`symbol$()!());               //Will be dict where key is SYMBOL of WS handle, value is that handles' subtable
                                    //E.g. 16 | +`panelID`tablename...!...
                                    //     21 | +`panelID`tablename...!...
tabreqs:(`symbol$()!());            //Will be dict where key is table name, value is list of handles that want that table
                                    //(E.g. if one user has 3 panels all wanting table `trade, tabreq[`trade] will only have that handle once.)

subreq:{[dict]
    subentry:(
        "J"$raze string .Q.an ? dict[`subscription;`panelId];
        dict[`subscription;`table];
        //dict[`subscription;`willBeTemporalBoolEventually];
        dict[`subscription;`temporal_col];
        value each dict[`subscription;`where_cols];
        $[`grouping_col in key dict[`subscription];dict[`subscription;`grouping_col];`];
        dict[`subscription;`select_cols]!dict[`subscription;`select_cols]
    );
    if[not (`$string[.z.w]) in key .grafLiveWS.subs;                            //if[first sub from this handle; create a subtable and add to .grafLiveWS.subs]
        .grafLiveWS.subs[`$string .z.w]:.grafLiveWS.subtable];
    subtabinsert:.[insert;
        (`$".grafLiveWS.subs.",string[.z.w];subentry);{"ERROR DURING SUBSCRIPTION: ",x}];
    newsubtab:.grafLiveWS.subs[`$string .z.w];
    reqtabs:exec distinct tablename from newsubtab;
    {[x;y]                                                                      //Update all tabreqs that this handle is subscribed to
        .grafLiveWS.tabreqs[x],:y;
        .grafLiveWS.tabreqs[x]:distinct .grafLiveWS.tabreqs[x];
        }[;.z.w]each reqtabs;
    
    success:$[10h=type subtabinsert;0b;1b];
    error:$[not success;subtabinsert;"OK"];
    datarequest:`subscriptionRequest;
    };

updwrap:{[f;t;data]
    f[t;data];                                                                  //Execute old upd
    wsUpdHandles:tabreqs[t];                                                    //Get list of all handles that want this table
    handleSubtabs:subs[wsUpd];                                                  //Get subtable for each of these handles
    outputtablearrays:{[data;subTab]                                            //Serialised data to be sent back
        {[data;subTabRow]
            groupingBool:not subTabRow[`byclause] = `;
            res:.[{[data;subTabRow] ?[                                          //Error trap wrapped functional select
                data;                                                           // FROM
                subTabRow[`whereclause];                                        // WHERE
                $[groupingBool;subTabRow[`byclause];0b];                        // BY 
                subTabRow[`selectclause]                                        // SELECT
            ]};(data;subTabRow);{x}];                                           //input + error trap
            if[10h=type res;:-8!"ERROR IN QUERY: ",res];                        //If func select failed, return string with error

            $[groupingBool;                                                     //Grouping check
                payload:(                                                       //Grouped payload
                    (flip (enlist subTabRow[`byclause])!enlist key flip each res);
                    value flip each res
                    );
                payload:@[                                                      //Ungrouped payload
                    {[res] (enlist enlist[`id]!enlist`x;res)};                  //Ungrouped payload (Function)
                    res;                                                        //Ungrouped payload (Arguments)
                    {"ERROR IN UNGROUPED TABLE HANDLING: ",x}                   //Ungrouped payload (Error handling)
                    ]
            ];                                                              
            
            id:subTabRow[`panelID];                                             //queryId
            error:if[10h=type payload;payload;"OK"]                             //Error object
            success:$[groupingBool;
                $[all 98h=type each payload[1];1b;0b];
                $[all 99h=type each payload[1];1b;0b]
            ];
            datarequest:`subscription;
            :(!) . flip (                                                       //Return dictionary
                (`error;error);
                (`id;id);
                (`success;success);
                (`payload;payload);
                (`datarequest;datarequest)
            );
        }[data;]each subTab
    }[data;]each handleSubtabs;


    @'[neg[wsUpdHandles];-8!'outputtablearrays];                                //Send serialised data to respective socket
    {neg[x][]}each wsUpdHandles;                                                //Flush on each socket
    }

\d .

upd:.grafLiveWS.updwrap[upd;;];                                                 //Wrap upd

.z.wc:{[x]                                                                      //Delete user's subscription info when their websocket closes
    delete x from `.grafLiveWS.subs;
    .grafLiveWS.tabreqs:{[x;y] y except x}[x;]each .grafLiveWS.tabreqs;
    };