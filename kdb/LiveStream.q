//Code for using LiveStream query with Grafana adaptor

\d .grafLiveWS

subtable:([panelID:`guid$()]        //Each user has their own subtable, each panel is one entry.
    tablename:`sym$();
    temporalbool:`boolean$();
    temporalfrom:`timestamp$();
    temporalto:`timestamp$();
    whereclause:();
    selectclause:()
    );

subs:(`int$()!());                  //Will be dict where key is websocket handle, value is that handles' subtable
tabreqs:(`symbol$()!());            //Will be dict where key is table name, value is list of handles that want that table
                                    //(E.g. if one user has 3 panels all wanting table `trade, tabreq[`trade] will only have that handle once.)

updwrap:{[f;t;x]
    f[t;x];                         //Execute old upd
    wsUpd:tabreqs[t];
    subtabs:subs[wsUpd];
    }

\d .

upd:.grafLiveWS.updwrap[upd;;];

subscriptionrequest:{[dict]
    
    
    
    };