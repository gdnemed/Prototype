var objects_service;
var inputs_service;
var coms_service;

exports.init=function(objects,inputs,coms){
  objects_service=objects;
  inputs_service=inputs;
  coms_service=coms;
}

exports.get_records=function(req,res){
  var customer='SPEC';
  objects_service.get_entities(customer,'record','code id,name',function(err,rows){
    if(err)	res.status(500).end(err.message);
		else res.status(200).jsonp(rows);
  });
}

exports.post_record=function(req,res){
  var customer='SPEC';
  //Don't allow records wihout identifier or id
  if (req.body.id==null){
    res.status(400).end();
    return;
  }
  var e={type:'record',code:req.body.id,name:req.body.name};
  objects_service.get_entity(customer,'record','code',e.code,'id',function(err,entity_array){
    if (err){
      res.status(500).end(err.message);
      return;
    }
    if (entity_array && entity_array.length>0){
      //Update
      e.id=entity_array[0].id;
      objects_service.update_entity(customer,e,function(err,id){
        if (err) res.status(500).end(err.message);
        else set_properties(customer,e,req,res,200);
      });
    }
    else{
      //Insert
      objects_service.insert_entity(customer,e,function(err,id){
        if (err) res.status(500).end(err.message);
        else {
          e.id=id;
          set_properties(customer,e,req,res,201);
        }
      });
    }
  });
}

function set_properties(customer,e,req,res,code_result){
  var l=[];
  if (req.body.language) l.push({property:'language',value:req.body.language});
  set_property(customer,e.id,l,0,function(err){
    if (err) res.status(500).end(err.message);
    else {
      res.status(code_result).end(String(e.id));
      //send to terminals
      coms_service.global_send('record_insert',{records:[{id:e.code}]});
    }
  });
}

function set_property(customer,id,l,i,callback){
  if (i>=l.length) callback();
  else {
    objects_service.insert_property(customer,id,l[i],function(err){
      if (err) res.status(500).end(err.message);
      else set_property(customer,id,l,i+1,callback);
    });
  }
}

exports.delete_record=function(req,res){
  objects_service.delete_entity(customer,'code',req.params.id,function(err,rows){
    if(err)	res.status(500).end(err.message);
		else  res.status(200).end();
  });
}

exports.get_cards=function(req,res){
  var customer='SPEC';
  objects_service.get_entity(customer,'record','code',req.params.id,'id',function(err,rows){
    if (err)res.status(500).end(err.message);
    else if (rows==null||rows.length==0) res.status(404).end();
    else {
      objects_service.get_simple_relation(customer,rows[0].id,'identifies',false,'card',function(err,rows){
        if(err)	res.status(500).end(err.message);
    		else {
          var l=[];
          for (var i=0;i<rows.length;i++)   l.push(rows[i].code);
          res.status(200).jsonp(l);
        }
      });
    }
  });

}

exports.post_cards=function(req,res){
  var customer='SPEC';
  objects_service.get_entity(customer,'record','code',req.params.id,'id',function(err,rows){
    if (err)res.status(500).end(err.message);
    else if (rows==null||rows.length==0) res.status(404).end();
    else {
      var id=rows[0].id;
      objects_service.get_simple_relation(customer,id,'identifies',false,'card',function(err,rows){
        if(err) res.status(500).end(err.message);
    		else {
          var l=[];
          for (var i=0;i<req.body.length;i++)   l.push({type:'card',code:req.body[i],node:1});
          objects_service.process_relations(customer,{id:id,type:'record'},
          'identifies',false,'code',rows,l,function(r,result){
            if(r!=null)	res.status(500).end(r.message);
        		else{
              res.status(200).end();
              send_cards(result);
            }
          });
        }
      });
    }
  });
}

function send_cards(result){
  for (var i=0;i<result.inserts.length;i++){
    var ins=result.inserts[i];
    coms_service.global_send('card_insert',{cards:[{card:ins.field,id:ins.id2}]});
  }
}

exports.get_fingerprints=function(req,res){
  var customer='SPEC';

  //TODO: search by code
  objects_service.get_property(customer,'fingerprint',parseInt(req.params.id),function(err,rows){
    if(err)	res.status(500).end(err.message);
		else  {
      var l=[];
      for (var i=0;i<rows.length;i++)   l.push(rows[i].value);
      res.status(200).jsonp(l);
    }
  });
}

exports.post_fingerprints=function(req,res){
  var customer='SPEC';

  //TODO: search by code
  var id=parseInt(req.params.id);
  objects_service.get_simple_property(customer,'fingerprint',id,function(err,rows){
    if(err) res.status(500).end(err.message);
		else {
      var f=objects_service.process_properties(customer,id,'fingerprint',rows,req.body,function(r){
        if(r!=null)	res.status(500).end(r.message);
    		else res.status(200).end();
      });
    }
  });
}

exports.get_clockings=function(req,res){
  var customer='SPEC';
  inputs_service.get_inputs_complete(customer,function(err, rows){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp(rows);
  });
}

exports.get_clockings_debug=function(req,res){
  var customer='SPEC';
  inputs_service.get_inputs(customer,function(err, r){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp({input:r[0],input_data_str:r[1]});
  });
}

exports.get_entities=function(req,res){
  var customer='SPEC';
  objects_service.get_entities(customer,null,null,function(err, rows){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp(rows);
  });
}

exports.get_properties=function(req,res){
  var customer='SPEC';
  objects_service.get_properties(customer,function(err, rows){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp(rows);
  });
}

exports.get_relations=function(req,res){
  var customer='SPEC';
  objects_service.get_relations(customer,function(err, rows){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp(rows);
  });
}

exports.init_terminal=function(serial){
  var customer='SPEC';
  objects_service.get_entities(customer,'record','CAST(code as integer) id',function(err, rows){
    if(err)	console.log(err.message);
    else  coms_service.global_send('record_insert',{records:rows});
  });
  objects_service.get_both_relation(customer,'identifies','code card','CAST(code as integer) id',function(err, rows){
    if(err)	console.log(err.message);
    else  coms_service.global_send('card_insert',{cards:rows});
  });
}

exports.create_clocking=function(clocking,customer,callback){
  objects_service.get_entity(customer,'record','code',clocking.record,'id',function(err,rows){
    if (err) callback(err);
    else{
      console.log(rows);
      if (rows && rows.length>0) clocking.owner=rows[0].id;
      inputs_service.create_clocking(clocking,customer,callback);
    }
  });
}

/**Upload process
*/
exports.get_pending_registers=function(tab,tv,customer,node,serial){
  switch(tab){
    //TODO: Falta el where amb la versió
    case 'record':objects_service.get_entities(customer,'record','CAST(code as integer) id',
        function(err, rows){
          coms_service.send_data(serial,'record_insert',{records:rows});
        });
    break;
  }
}
