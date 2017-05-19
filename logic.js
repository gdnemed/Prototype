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
  objects_service.get_entity(customer,'record','code',e.code,function(err,entity_array){
    if (err){
      res.status(500).end(err.message);
      return;
    }
    if (entity_array && entity_array.length>0){
      e.id=entity_array[0].id;
      objects_service.update_entity(customer,e,function(err,id){
        if (err) res.status(500).end(err.message);
        else {
          //now, properties
          set_record_language(customer,e.id,req.body,function(){res.status(200).end()});
        }
      });
    }
    else{
      objects_service.insert_entity(customer,e,function(err,id){
        if (err) res.status(500).end(err.message);
        else {
          //send to terminals
          coms_service.global_send('record_insert',{id:id});
          //now, properties
          set_record_language(customer,id,req.body,function(err){
            if (err) res.status(500).end(err.message);
            else res.status(201).end(String(id));
          });
        }
      });
    }
  });
}

function set_record_language(customer,id,data,callback){
  if (data.language){
    var property={property:'language',value:data.language};
    objects_service.insert_property(customer,id,property,function(err){
      if (err) res.status(500).end(err.message);
      else callback();
    });
  }
  else callback();
}

exports.delete_record=function(req,res){
  objects_service.delete_entity(customer,parseInt(req.params.id),function(err,rows){
    if(err)	res.status(500).end(err.message);
		else  res.status(200).end();
  });
}

exports.get_cards=function(req,res){
  var customer='SPEC';
  objects_service.get_simple_relation(customer,parseInt(req.params.id),'identifies',false,'card',function(err,rows){
    if(err)	res.status(500).end(err.message);
		else {
      var l=[];
      for (var i=0;i<rows.length;i++)   l.push(rows[i].code);
      res.status(200).jsonp(l);
    }
  });
}

exports.post_cards=function(req,res){
  var customer='SPEC';
  var id=parseInt(req.params.id);
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

function send_cards(result){
  for (var i=0;i<result.inserts.length;i++){
    var ins=result.inserts[i];
    coms_service.global_send('card_insert',{card:ins.field,id:ins.id2});
  }
}

exports.get_fingerprints=function(req,res){
  var customer='SPEC';
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
  inputs_service.get_inputs(customer,function(err, rows){
    if(err)	res.status(500).end(err.message);
    else  res.status(200).jsonp(rows);
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
