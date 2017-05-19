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
  "(id integer, property integer, value text)");
  db.run("CREATE TABLE if not exists input_data_num_"+node_id+"_201705 "+
  "(id integer, property integer, value integer)");
  db.run("CREATE TABLE if not exists input_data_bin_"+node_id+"_201705 "+
  "(id integer, property integer, value blob)");
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

exports.create_clocking=function(clocking,customer,callback){
  if (current_id==null) {
    callback(new Error('Service unavailable'));
    return;
  }
  var db=dbs[customer];
  var params=[current_id,clocking.tmp,clocking.gmt,clocking.reception,
    clocking.owner,clocking.source,clocking.result,clocking.serial];
  current_id++;
  db.run("INSERT INTO input_"+node_id+"_201705 "+
  "(id,tmp,gmt,reception,owner,source,result,serial) VALUES (?,?,?,?,?,?,?,?)",
    params,
    function(err){
      if (err)  callback(err);
      else if (clocking.card) set_input_data(customer, params[0],'card',clocking.card,callback);
      else callback();
    }
  );
}

function set_input_data(customer,id,property,value,callback){
  var db=dbs[customer];
  db.run("INSERT INTO input_data_str_"+node_id+"_201705 (id,property,value) values (?,?,?)",
    [id,property,value],
    function(err){
      callback(err);
    });
}
