var sqlite = require('sqlite3');
var dbs={};
var node_id;
var current_id;

exports.init=function(node,customers){
  node_id=node;
  for (var i=0;i<customers.length;i++)
    dbs[customers[i]]=init_db(customers[i]);
}

function init_db(customer){
  var db = new sqlite.Database('./db/'+customer+'/inputs_'+node_id+'_2017.db');
  db.run("CREATE TABLE if not exists input_"+node_id+"_201705 "+
  "(id integer, tmp integer, gmt integer, reception integer, "+
  "owner integer, result integer, source integer, serial text)");
  db.run("CREATE TABLE if not exists input_data_str_"+node_id+"_201705 "+
  "(id integer, property integer, value text)",function(){
    db.run("CREATE INDEX if not exists i_input_data_str_"+
    node_id+"_201705_p on input_data_str_"+node_id+"_201705 (property)");
    db.run("CREATE INDEX if not exists i_input_data_str_"+
    node_id+"_201705_i on input_data_str_"+node_id+"_201705 (id)");
  });
  db.run("CREATE TABLE if not exists input_data_num_"+node_id+"_201705 "+
  "(id integer, property integer, value integer)",function(){
    db.run("CREATE INDEX if not exists i_input_data_num_"+
    node_id+"_201705_p on input_data_num_"+node_id+"_201705 (property)");
    db.run("CREATE INDEX if not exists i_input_data_num_"+
    node_id+"_201705_i on input_data_num_"+node_id+"_201705 (id)");
  });
  db.run("CREATE TABLE if not exists input_data_bin_"+node_id+"_201705 "+
  "(id integer, property integer, value blob)",function(){
    db.run("CREATE INDEX if not exists i_input_data_bin_"+
    node_id+"_201705_p on input_data_bin_"+node_id+"_201705 (property)");
    db.run("CREATE INDEX if not exists i_input_data_bin_"+
    node_id+"_201705_i on input_data_bin_"+node_id+"_201705 (id)");
  });
  db.run("CREATE TABLE if not exists input_rel_"+node_id+"_201705 "+
  "(id integer, relation integer, entity integer)",function(){
    db.run("CREATE INDEX if not exists i_input_rel_"+
    node_id+"_201705_r on input_rel_"+node_id+"_201705 (relation)");
    db.run("CREATE INDEX if not exists i_input_rel_"+
    node_id+"_201705_i on input_rel_"+node_id+"_201705 (id)");
  });
  db.run("CREATE TABLE if not exists local_id(id integer)",[],function(err){
    if (err){
      console.log(err.message);
      process.exit(0);
    }
    db.all("SELECT id from local_id",[],function(err,rows){
      if (err){
        console.log(err.message);
        process.exit(0);
      }
      if (rows==null||rows.length==0){
        db.run("INSERT INTO local_id(id) values (1)",[],function(e){
          if (e){
            console.log(e.message);
            process.exit(0);
          }
          else current_id=1;
        });
      }
      else current_id=rows[0].id;
    });
  });
  return db;
}

exports.get_inputs=function(customer,callback){
  var db=dbs[customer];
  var res=[null,null];
  db.all("SELECT * from input_"+node_id+"_201705", function(err,rows){
    res[0]=rows;
    db.all("SELECT * from input_data_str_"+node_id+"_201705",function(err,rows){
      res[1]=rows;
      callback(null,res);
    });
  });
}

//this is so specific fot test
exports.get_inputs_complete=function(customer,callback){
  var db=dbs[customer];
  db.all("select b.*,c.card record from (SELECT i.id,tmp,result,a.card, 'lect1' reader from input_"+
node_id+"_201705 i left join (select id,value card from input_data_str_"+
node_id+"_201705 where property='card') a on a.id=i.id) b left join "+
"(select id,value card from input_data_str_"+
node_id+"_201705 where property='record') c on b.id=c.id", callback);
}

exports.create_clocking=function(clocking,customer,callback){
  if (current_id==null) {
    callback(new Error('Service unavailable'));
    return;
  }
  var db=dbs[customer];
  var params=[current_id,clocking.tmp,clocking.gmt,clocking.reception,
    clocking.owner,clocking.source,clocking.result,clocking.serial];
  current_id++;
  db.run("UPDATE local_id set id=?",[current_id],function(err){
    if (err){
      console.log(err.message);
      process.exit(0);
    }
  });
  var properties=[];
  if (clocking.card) properties.push({property:'card',value:clocking.card});
  if (clocking.record) properties.push({property:'record',value:clocking.record});
  db.run("BEGIN TRANSACTION",function(err){
    if (err) callback(err);
    else{
      db.run("INSERT INTO input_"+node_id+"_201705 "+
      "(id,tmp,gmt,reception,owner,source,result,serial) VALUES (?,?,?,?,?,?,?,?)",
        params,
        function(err){
          if (err){
            db.run("ROLLBACK");
            callback(err);
          }
          else set_input_data(db, params[0],properties,0,callback);
        }
      );
    }
  });
}

function set_input_data(db,id,properties,i,callback){
  if (i>=properties.length) commit(db,callback);
  else{
    db.run("INSERT INTO input_data_str_"+node_id+"_201705 (id,property,value) values (?,?,?)",
      [id,properties[i].property,properties[i].value],
      function(err){
        if (err){
          db.run("ROLLBACK");
          callback(err);
        }
        else set_input_data(db,id,properties,i+1,callback);
      });
  }
}

function commit(db,callback){
  db.run("COMMIT",function(err){
    if (err){
      db.run("ROLLBACK");
      callback(err);
    }
    else callback();
  });
}
