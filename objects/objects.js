var utilsDb = require('../utils/db.js');

const START_OF_TIME=19900101000000;
const END_OF_TIME=99991231235959;

var sqlite = require('sqlite3');
var structured = require('./structured');

var dbs={};
var node_id;
var state_service;

exports.init=function(node,customers,state){
  node_id=node;
  state_service=state;
  for (var i=0;i<customers.length;i++)
    dbs[customers[i]]=init_db(customers[i]);
}

function init_db(customer){
  var db = utilsDb.createDatabase(customer, 'objects', node_id);

  db.run("CREATE TABLE if not exists entity_"+node_id+
  " (id integer, type text, name text, name2 text, intname text, document text, code text)",[],function(){
    db.run("CREATE UNIQUE INDEX if not exists i_entity_"+node_id+"_id on entity_"+node_id+" (id)");
    db.run("CREATE INDEX if not exists i_entity_"+node_id+"_code on entity_"+node_id+" (type,code)");
    db.run("CREATE INDEX if not exists i_entity_"+node_id+"_name on entity_"+node_id+" (type,name)");
    db.run("CREATE INDEX if not exists i_entity_"+node_id+"_nc on entity_"+node_id+" (type,name,name2)");
    db.run("CREATE INDEX if not exists i_entity_"+node_id+"_document on entity_"+node_id+" (type,document)");
  });
  db.run("CREATE TABLE if not exists property_num_"+node_id+
  " (entity integer, property text, t1 integer, t2 integer, value integer)",[],function(){
    db.run("CREATE INDEX if not exists i_property_num_"+node_id+"_pe on property_num_"+node_id+" (property,entity)");
    db.run("CREATE INDEX if not exists i_property_num_"+node_id+"_pv on property_num_"+node_id+" (property,value)");
  });

  db.run("CREATE TABLE if not exists property_str_"+node_id+
  " (entity integer, property text, t1 integer, t2 integer, value text)",[],function(){
    db.run("CREATE INDEX if not exists i_property_str_"+node_id+"_pe on property_str_"+node_id+" (property,entity)");
    db.run("CREATE INDEX if not exists i_property_num_"+node_id+"_pv on property_num_"+node_id+" (property,value)");
  });

  db.run("CREATE TABLE if not exists property_bin_"+node_id+
  " (entity integer, property text, t1 integer, t2 integer, value blob)",[],function(){
    db.run("CREATE INDEX if not exists i_property_bin_"+node_id+"_pe on property_bin_"+node_id+" (property,entity)");
  });

  db.run("CREATE TABLE if not exists relation_"+node_id+
  " (relation text, id1 integer, id2 integer, t1 integer, t2 integer, ord integer, node integer)",[],function(){
    db.run("CREATE INDEX if not exists i_relation_"+node_id+"_r1 on relation_"+node_id+" (relation,id1)");
    db.run("CREATE INDEX if not exists i_relation_"+node_id+"_r2 on relation_"+node_id+" (relation,id2)");
  });
  return db;
}

exports.get_entities=function(customer,type,transform,callback){
  var db=dbs[customer];
  db.all("SELECT "+(transform?transform:"*")+
  " from entity_"+node_id+(type?" where type=?":""),
  type?[type]:[],
  function(err, rows){
		if(err)	callback(err);
		else callback(null,rows);
	});
}

exports.get_entity=function(customer,type,field,value,transform,callback){
  var db=dbs[customer];
  db.all("SELECT "+(transform?transform:"*")+
  " from entity_"+node_id+" where "+field+"=?"+(type?" and type=?":""),
    type?[value,type]:[value],
    function(err, rows){
  		if(err) callback(err);
  		else callback(null,rows);
  	});
}

exports.insert_entity=function(customer,e,callback){
  state_service.new_id(customer,function(err,newid){
    if (err) callback(err);
    else{
      var db=dbs[customer];
      var params=[newid,e.type,e.name,e.name2,e.document,e.code,e.intname];
      db.run("INSERT INTO entity_"+node_id+" (id,type,name,name2,document,code,intname) VALUES (?,?,?,?,?,?,?)",
        params,
        function(err){
          if(err)	callback(err);
      		else callback(null,newid);
        }
      );
    }
  });
}

exports.update_entity=function(customer,e,callback){
  var db=dbs[customer];
  db.run("UPDATE entity_"+node_id+" set type=?,name=?,name2=?,document=?,code=?,intname=? where id=?",
    [e.type,e.name,e.name2,e.document,e.code,e.intname,e.id],
    function(err){callback(err);}
  );
}

exports.delete_entity=function(customer,field,id,callback){
  var db=dbs[customer];
  db.run("delete from entity_"+node_id+" where "+field+"=?",
    [id],
    function(err){callback(err);}
  );
}

exports.get_properties=function(customer,callback){
  var db=dbs[customer];
  db.all("SELECT * from property_str_"+node_id,
    [property,entity],
    function(err, rows){
		if(err)	callback(err);
		else callback(null,rows);
	});
}

exports.get_property=function(customer,property,entity,callback){
  var db=dbs[customer];
  //TODO: detectar el tipus de taula a partir de la propietat
  db.all("SELECT * from property_str_"+node_id+" where property=? and entity=?",
    [property,entity],
    function(err, rows){
		if(err)	callback(err);
		else callback(null,rows);
	});
}

exports.get_simple_property=function(customer,property,entity,callback){
  var db=dbs[customer];
  //TODO: detectar el tipus de taula a partir de la propietat
  db.all("SELECT value from property_str_"+node_id+" where property=? and entity=?",
    [property,entity],
    function(err, rows){
		if(err)	callback(err);
		else {
      var l=[];
      for (var i=0;i<rows.length;i++) l.push(rows[i].value);
      callback(null,l);
    }
	});
}

exports.insert_property=function(customer,entity,property,callback){
  var db=dbs[customer];
  if (property.t1==null) property.t1=START_OF_TIME;
  if (property.t2==null) property.t2=END_OF_TIME;
  //TODO: detectar el tipus de taula a partir de la propietat
  db.run("INSERT INTO property_str_"+node_id+" (entity,property,t1,t2,value) VALUES (?,?,?,?,?)",
    [entity,property.property,property.t1,property.t2,property.value],
    function(err){callback(err);}
  );
}

exports.delete_property=function(customer,entity,property,value,callback){
  var db=dbs[customer];
  //TODO: detectar el tipus de taula a partir de la propietat
  db.run("DELETE FROM property_str_"+node_id+" where entity=? and property=? and value=?",
    [entity,property.property,property.value],
    function(err){callback(err);}
  );
}

/////////Complete update for a list of property values//////

function properties_deletes(customer,entity,property,rows_db,rows_api,i,result,callback){
  if (i>=rows_db.length) callback();
  else{
    if (!rows_api.find(function(a){rows_db[i]==a})){
      exports.delete_property(customer,entity,{property:property,value:rows_db[i]},rows_db[i],function(err){
        if (err!=null) result.error=err;
        properties_deletes(customer,entity,property,rows_db,rows_api,i+1,result,callback);
      });
    }
    else properties_deletes(customer,entity,property,rows_db,rows_api,i+1,result,callback);
  }
}

function properties_inserts(customer,entity,property,rows_db,rows_api,i,result,callback){
  if (i>=rows_api.length) callback();
  else{
    if (!rows_db.find(function(a){rows_api[i]==a})){
      exports.insert_property(customer,entity,{property:property,value:rows_api[i]},function(err){
        if (err!=null) result.error=err;
        properties_inserts(customer,entity,property,rows_db,rows_api,i+1,result,callback);
      });
    }
    else properties_inserts(customer,entity,property,rows_db,rows_api,i+1,result,callback);
  }
}

exports.process_properties=function (customer,entity,property,rows_db,rows_api,callback){
    var result={};
    properties_deletes(customer,entity,property,rows_db,rows_api,0,result,function(){
      if (result.error) callback(error);
      else{
        result={};
        properties_inserts(customer,entity,property,rows_db,rows_api,0,result,function(){
          callback(result.error);
        });
      }
    });
}
/////////////////////////////////////////

exports.get_relations=function(customer,callback){
  var db=dbs[customer];
  db.all("SELECT * from relation_"+node_id,
    [],
    function(err, rows){
		if(err)	callback(err);
		else callback(null,rows);
	});
}

/**Gets every entity related to entity 'entity' through relation 'relation', following
direction 1->2 if 'forward' or 2->1 otherwise.
type_related can be specified if only elements of a concrete type should be taken.
*/
exports.get_simple_relation=function(customer,entity,relation,forward,type_related,callback){
  var db=dbs[customer];
  db.all("SELECT id"+(forward?"2,node":"1")+" from relation_"+node_id+
  " where relation=?"+(entity?" and id"+(forward?1:2)+"=?":""),
    entity?[relation,entity]:[relation],
    function(err, rows){
  		if(err)	callback(err);
  		else get_entities_related(customer,rows,0,[],type_related,forward,null,callback);
  	});
}

/**Gets entity related to element i of 'rows' array (which stores the relation)
and, if it is of type 'type_related', adds it to array l or, if l is null, puts
its properties in rows.
*/
function get_entities_related(customer,rows,i,l,type_related,forward,transform,callback){
  if (i==rows.length) callback(null,l?l:rows);
  else{
    exports.get_entity(customer,null,'id',
      forward?rows[i].id2:rows[i].id1,transform,
      function(err,a){
        if (err) callback(err)
        else{
          console.log(a);
          for (var j=0;j<a.length;j++){
            if (l){
                if (type_related && a[j].type!=type_related) continue;
                l.push(a[j]);
            }
            else{
              delete rows[i].id1;
              delete rows[i].id2;
              delete rows[i].node;
              for (var p in a[j]){
                if (a[j].hasOwnProperty(p))
                  rows[i][p]=a[j][p];
              }
            }
          }
          get_entities_related(customer,rows,i+1,l,type_related,forward,transform,callback);
        }
      });
  }
}

/**Gets both elements of a relation
*/
exports.get_both_relation=function(customer,relation,transform1,transform2,callback){
  var db=dbs[customer];
  db.all("SELECT "+(transform1?transform1:"*")+
  ",id2,node from relation_"+node_id+",entity_"+node_id+" where relation=? and id=id1",
    [relation],
    function(err, rows){
  		if(err)	callback(err);
  		else get_entities_related(customer,rows,0,null,null,true,transform2,callback);
  	});
}

exports.delete_relation=function(customer,relation,id1,id2,callback){
  var db=dbs[customer];
  db.all("DELETE from relation_"+node_id+" where relation=? and id1=? and id2=?",
    [relation,id1,id2],
    function(err){callback(err);});
}

exports.insert_relation=function(customer,relation,id1,id2,e2node,callback){
  var db=dbs[customer];
  db.all("INSERT into relation_"+node_id+"(relation,id1,id2,node,t1,t2,ord) values (?,?,?,?,?,?,?)",
    [relation,id1,id2,e2node,START_OF_TIME,END_OF_TIME,0],
    function(err){callback(err);});
}

/////////Complete update for a list of related objects//////
exports.process_relations=function (customer,entity,relation,forward,field,rows_db,rows_api,callback){
    var result={inserts:[],deletes:[],errors:[]};
    relations_deletes(customer,entity,relation,forward,field,rows_db,rows_api,0,result,function(){
      if (result.errors.length>0) callback(result.errors[0],result);
      else{
        relations_inserts(customer,entity,relation,forward,field,rows_db,rows_api,0,result,function(){
          callback(result.errors.length>0?result.errors[0]:null,result);
        });
      }
    });
}

function relations_deletes(customer,entity,relation,forward,field,rows_db,rows_api,i,result,callback){
  if (i>=rows_db.length) callback();
  else{
    if (!rows_api.find(function(a){rows_db[i][field]==a[field]})){
      exports.delete_relation(customer,relation,
        forward?entity.id:rows_db[i].id,
        forward?rows_db[i].id:entity.id,
        function(err){
          if (err!=null) result.errors.push(err);
          else result.inserts.push(forward?{id1:entity.id,id2:rows_db[i].id}:{id1:rows_db[i].id,id2:entity.id});
          relations_deletes(customer,entity,relation,forward,field,rows_db,rows_api,i+1,result,callback);
        });
    }
    else relations_deletes(customer,entity,relation,forward,field,rows_db,rows_api,i+1,result,callback);
  }
}

function relations_inserts(customer,entity,relation,forward,field,rows_db,rows_api,i,result,callback){
  if (i>=rows_api.length) callback();
  else{
    if (!rows_db.find(function(a){rows_api[i][field]==a[field]})){
      //Search if new related entity exists
      exports.get_entity(customer,entity.type,field,rows_api[i][field],'id',function(err,rows){
        if (err) callback(err);
        else if (rows!=null && rows.length>0)
          put_related_entity(customer,entity,relation,forward,field,rows_db,rows_api,i,result,callback);
        else
          exports.insert_entity(customer,rows_api[i],function(err,newid){
            if (err) callback(err);
            else {
              rows_api[i].id=newid;
              put_related_entity(customer,entity,relation,forward,field,rows_db,rows_api,i,result,callback);
            }
          });
      });
    }
    else relations_inserts(customer,entity,relation,forward,field,rows_db,rows_api,i+1,result,callback);
  }
}

function put_related_entity(customer,entity,relation,forward,field,rows_db,rows_api,i,result,callback){
  exports.insert_relation(customer,relation,
      forward?entity.id:rows_api[i].id,
      forward?rows_api[i].id:entity.id,
      forward?node_id:rows_api[i].node,
      function(err){
        if (err!=null) result.errors.push(err);
        else result.inserts.push(forward?{id1:entity.id,id2:rows_api[i].id,field:rows_api[i][field]}:
                                        {id1:rows_api[i].id,id2:entity.id,field:rows_api[i][field]});
        relations_inserts(customer,entity,relation,forward,field,rows_db,rows_api,i+1,result,callback);
      });
}
////////////////////////////////////

exports.get_query=function(req,res){
  var db=dbs['SPEC'];
  structured.structured_get(db,req.body,function(err,ret){
    if(err)	res.status(500).end(err.message);
		else res.status(200).jsonp(ret);
  });
}
