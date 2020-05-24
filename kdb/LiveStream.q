//Code for using LiveStream query with Grafana adaptor
upd:{[t;d] t insert d} /////EXAMPLE UPD STATEMENT

\d .grafLiveWS

subtable:([]
    panelID:`long$();        //Each user has their own subtable, each panel is one entry.
    refId:`symbol$();                  //refId of query in panel
    tablename:`symbol$();              //name of table selecting from
    //temporalbool:`boolean$();
    temporal_col:`symbol$();           //name of temporal column
    //temporalfrom:`timestamp$();
    //temporalto:`timestamp$();
    whereclause:();                 //where clause 
    byclause:();
    selectclause:()
    );

subs:((`symbol$())!());                                                     //Will be dict where key is SYMBOL of WS handle, value is that handles' subtable
                                                                            //E.g. 16 | +`panelID`tablename...!...
                                                                            //     21 | +`panelID`tablename...!...
//tabreqs:((`symbol$())!enlist `int$());                                    //Will be dict where key is table name, value is list of handles that want that table
tabreqs:enlist[(`.grafLiveWS.itemforcasting)]!enlist (-1 -2i)
                                                                                //(E.g. if one user has 3 panels all wanting table `trade, tabreq[`trade] will only have that handle once.)

selectReader:{[x] :(value first x;last x)};

subreq:{[dict]
    .grafLiveWS.DEVREQ: dict;
    reqid:"J"$raze string .Q.an ? dict[`panelId];
    refId:`$dict[`refId];
    subentry:(
        reqid;
        refId;
        dict[`subscription;`table];
        //dict[`subscription;`willBeTemporalBoolEventually];
        dict[`subscription;`temporal_col];
        value each dict[`subscription;`where_cols];
        $[`grouping_col in key dict[`subscription];dict[`subscription;`grouping_col];`];
        selectReader each dict[`subscription;`select_cols]
    );
    .grafLiveWS.DEVSUB:subentry;
    if[not (`$string[.z.w]) in key .grafLiveWS.subs;                            //if[first sub from this handle; create a subtable and add to .grafLiveWS.subs]
        .grafLiveWS.subs[`$string .z.w]:.grafLiveWS.subtable];

    subtabinsert:.[insert;
        (`$".grafLiveWS.subs.",string[.z.w];subentry);{"ERROR DURING SUBSCRIPTION: ",x}];
    newsubtab:.grafLiveWS.subs[`$string .z.w];
    reqtabs:exec distinct tablename from newsubtab;
    {[x;y]                                                                      //Update all tabreqs that this handle is subscribed to
        .grafLiveWS.tabreqs[x]:.grafLiveWS.tabreqs[x],y;
        .grafLiveWS.tabreqs[x]:distinct .grafLiveWS.tabreqs[x];
        }[;.z.w]each reqtabs;
    
    success:$[10h=type subtabinsert;0b;1b];
    error:$[not success;subtabinsert;"OK"];
    datarequest:`subscriptionRequest;
    :(!) . flip (                                                       //Return dictionary
                (`error;error);
                (`refId;refId);
                (`id;reqid);
                (`success;success);
                (`datarequest;datarequest)
            );
    };

subend:{[dict]
    .grafLiveWS.DEVEND:dict;
    scopedPanelId:"J"$raze string .Q.an ? dict[`panelId];
    scopedRefId:`$dict[`refId];
    subtabdelete:.[{[x;y;z]
        delete from z where ((refId=x) and (panelID=y))};
        (scopedRefId;scopedPanelId;`$".grafLiveWS.subs.",string[.z.w]);
        {"ERROR IN REMOVING SUBSCRIPTION: ",x}];
    success:$[10h=type subtabdelete;0b;1b];
    error:$[not success;subtabdelete;"OK"];
    datarequest:`subscriptionRequest;
    :(!) . flip (                                                       //Return dictionary
                (`error;error);
                (`refId;scopedRefId);
                (`id;scopedPanelId);
                (`success;success);
                (`datarequest;datarequest)
            );
    };

updwrap:{[f;t;data]
    f[t;data];                                                                  //Execute old upd
    wsUpdHandles:tabreqs[t];                                                    //Get list of all handles that want this table
    handleSubtabs:subs[`$string wsUpdHandles];                                  //Get subtable for each of these handles
    handleSubtabs:{[x;subtab] select from subtab where tablename=x}[t;]each handleSubtabs; //Select from each handleSubtabs where the tablename matches the new data

    outputtablearrays:{[data;subTab]                                            //Serialised data to be sent back
        {[data;subTabRow]
            groupingBool:not subTabRow[`byclause] = `;
            //selectTime:$[subTabRow[`useConflation];                           //For when conflation is supported
            //    ()!();                                                        //For when conflation is supported
            //    enlist[subTabRow[`temporal_col]]!enlist (::;subTabRow[`temporal_col])];       //For when conflation is supported
            selectTime:enlist[subTabRow[`temporal_col]]!enlist (::;subTabRow[`temporal_col]);   //Until then use this
            res:.[{[data;subTabRow;grp;slctT] ?[                                          //Error trap wrapped functional select
                data;                                                           // FROM
                subTabRow[`whereclause];                                        // WHERE
                $[grp;                                                          // BY
                    enlist[subTabRow[`byclause]]!enlist[subTabRow[`byclause]];  // BY
                    0b];                                                        // BY
                slctT,subTabRow[`selectclause]]                                 // SELECT
            };(data;subTabRow;groupingBool;selectTime);{x}];                                           //input + error trap
            if[10h=type res;:-8!"ERROR IN QUERY: ",res];                        //If func select failed, return string with error
            .dg.selectdetails:(data;subTabRow;groupingBool;selectTime);
            .dg.lastres:res;
            $[groupingBool;                                                     //Grouping check
                payload:(                                                       //Grouped payload
                    (key flip each res);
                    {enlist[`data]!enlist x}each value flip each res
                    );
                payload:@[                                                      //Ungrouped payload
                    {[res] (enlist enlist[`id]!enlist`x;enlist (enlist[`data]!enlist res))}; //Ungrouped payload (Function)
                    res;                                                        //Ungrouped payload (Arguments)
                    {"ERROR IN UNGROUPED TABLE HANDLING: ",x}                   //Ungrouped payload (Error handling)
                    ]
                ];                                                              

            id:subTabRow[`panelID];                                             //queryId
            refId:subTabRow[`refId];                                            //refId
            error:if[10h=type payload;payload;"OK"]                             //Error object
            success:$[groupingBool;
                $[all 98h=type each payload[1];1b;0b];
                $[all 99h=type each payload[1];1b;0b]
            ];
            datarequest:`subscription;
            :.dg.viewint:(!) . flip (                                                       //Return dictionary
                (`error;error);
                (`refId;refId);
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
    ![`.grafLiveWS.subs;();0b;enlist (`$string[x])];                            //delete (`$string[x]) from `.grafLiveWS.subs;
    .grafLiveWS.tabreqs:{[x;y] y except x}[x;]each .grafLiveWS.tabreqs;
    };