snapshotfunc:{[dict]
  
    t:dict[`table];
    tc:dict[`temporal_col];
    tr:dict[`temporal_range];
    w:dict[`where_cols];
    g:dict[`grouping_col];
    gbool:not g=`;
    s:dict[`select_cols];
    mr:dict[`maxRowCount];
    id:dict[`queryId];

    dt:?[t;w,(within;tr);$[gbool;g;0b];s];
    //if[mr<count dt;some error];

    $[gBool;                                                     //Grouping check
        payload:(                                                       //Grouped payload
            (flip (enlist g)!enlist key flip each dt);
            value flip each dt
            );
        payload:@[                                                      //Ungrouped payload
            {[dt] (enlist enlist[`id]!enlist`x;dt)};                  //Ungrouped payload (Function)
            dt;                                                        //Ungrouped payload (Arguments)
            {"ERROR IN UNGROUPED TABLE HANDLING: ",x}                   //Ungrouped payload (Error handling)
            ]
        ];
    error:$[10h=type payload;payload;"OK"];
    success:$[error~"OK";1b;0b]
    :(`payload`datarequest`error`success)!(payload;`snapshot;error;success)
  }