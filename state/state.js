var sqlite = require('sqlite3');
var dbs={};
var node_id;
var current_id;

exports.init=function(customers){
  node_id=1;
  for (var i=0;i<customers.length;i++)
    dbs[customers[i]]=init_db(customers[i]);
}

function init_db(customer){
  var db = new sqlite.Database('./db/'+customer+'/state.db');
  db.run("CREATE TABLE if not exists settings (var text, code text)");
  db.run("CREATE TABLE if not exists global_id(id integer)",[],function(err){
    if (err){
      console.log(err.message);
      process.exit(0);
    }
    db.all("SELECT id from global_id",[],function(err,rows){
      if (err){
        console.log(err.message);
        process.exit(0);
      }
      if (rows==null||rows.length==0){
        db.run("INSERT INTO global_id(id) values (1)",[],function(e){
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

exports.new_id=function(customer,callback){
  if (current_id==undefined)  callback(new Error('not ready'));
  else{
    var db=dbs[customer];
    db.run("UPDATE global_id set id=id+1",[],function(err,rows){
      current_id++;
      callback(err,current_id);
    });
  }
}
