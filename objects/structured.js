const MODEL = require('./model')
var node_id=1;

exports.structured_get=function(db,str,callback){
  var what='entity';
  var type;
  if (str._relation_){
    what='relation';
    type=str._relation_;
  }
  else if (str._property_){
    what='property';
    type=str._property_;
  }
  else if (str._entity_){
    type=str._entity_;
  }
  var is_array=false;
  if (type && type.charAt(0)=='['){
    is_array=true;
    type=type.substring(1,type.length-1);
  }
  var select=get_simple_fields(str);
  var subqueries=get_subqueries(str);
  var filter;
  if (str._filter_) filter=str._filter_;
  else if (str._id_) filter="id="+str._id_;

  var where;
  switch(what){
    case 'entity':
      var query="SELECT id _id_,"+select.complete+" FROM entity_"+node_id;
      if (str._entity_) where=" where type='"+type+"'";
      if (str.filter){
        if (where) where+=" and ("+filter+")";
        else where=" where "+filter;
      }
      if (where) query+=where;

      query=get_property_fields(query,str);
      console.log(query);
      db.all(query,[],function(err,rows){
        if (err) callback(err);
        else {
          if (subqueries) process_row(db,rows,0,subqueries,0,callback);
          else{
            for (var i=0;i<rows.length;i++) delete rows[i]._id_;
            if (!is_array){
              if (rows.length>0) callback(null,rows[0]);
              else callback(null,null);
            }
            else callback(err,rows);
          }
        }
      });
    break;
    case 'property':
    if (str.name){
      //TODO: listas históricas
    }
    break;
    case 'relation':
    break;
  }
}

function get_simple_fields(str,prefix){
  if (str){
    var res;
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0)=='_' && property!='_field_'){}
        else if (typeof str[property] == 'string'){
          if (res){
            res.complete+=","+(prefix?prefix+".":"")+str[property]+" "+property;
            res.names+=","+property;
          }
          else res={complete:str[property]+" "+property,names:property};
        }
      }
  	}
    return res;
  }
}

function get_subqueries(str){
  if (str){
    var res;
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0)=='_'){}
        else if (typeof str[property] != 'string'){
          var d=str[property];
          d._entry_name_=property;
          //relation
          if (d._what_.indexOf('->')<0 && d._what_.indexOf('<-')<0){
            if (res) res.push(d);
            else res=[d];
          }
          else{
            //array of properties

          }
        }
      }
    }
    return res;
  }
}

/**Build joins with property table, for the required properties.
*/
function get_property_fields(query,str){
  if (str){
    var res;
    var i=1;
    for (var property in str) {
      if (str.hasOwnProperty(property)) {
        if (property.charAt(0)=='_'){}
        else if (typeof str[property] != 'string'){
          var d=str[property];
          //No relations, and only single properties
          if (d._what_.indexOf('->')<0 && d._what_.indexOf('<-')<0 && d._what_.charAt(0)!='['){
            var select=get_simple_fields(d,"q"+i);
            //If no detailed fields, we assume it is the "value"
            if (select==null) select={names:property,complete:"value "+property}
            if (res){
              res="select sq"+i+".*"
            }
            else res="select q.*,"+select.names+" from ("+query+
            ") q left join (select id _idp_,"+select.complete+
            " from property_"+get_type_property(d._what_)+"_"+node_id+") q"+i+
            " on q._id_=q"+i+"._idp_";
            i++;
          }
        }
      }
    }
    if (res)  return res;
    else return query;
  }
}

function process_row(db,rows,i,subqueries,j,callback){
  if (i>rows.length) callback(null,rows);
  if (j>=subqueries.length){
    delete rows[i]._id_;
    process_row(db,rows,i+1,subqueries,0,callback);
  }
  else{
    var s=subqueries[j];
    var sql="select "+(s.forward?"id2,node":"id1")+" from relation_"+node_id+
    " where relation=? and "+(s.forward?"id1":"id2")+"=?";
    db.all(sql,[s.type,rows[i]._id_],function(err,rows_sq){
      if (err) callback(err);
      else{
        /*if (s.name)  rows[i][name]=rows_sq;
        else{
          for (var property in clients) {
            if (clients.hasOwnProperty(property)) {

            }
        	}
        }*/
        process_row(db,rows,i,subqueries,j+1,callback);
      };
    });
  }
}

function get_type_property(p){
  return MODEL.PROPERTIES[p].type;
}
