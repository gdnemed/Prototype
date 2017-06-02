const MODEL = require('./model');
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
      if (filter){
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
          else res={complete:(prefix?prefix+".":"")+str[property]+" "+property,names:property};
          switch(str[property]){
            case 'id1':case 'id2':case 't1':case 't2':case 'order':case 'node':
              if (res.complete_relation)
                res.complete_relation+=","+(prefix?prefix+".":"")+str[property]+" "+property;
              else res.complete_relation=(prefix?prefix+".":"")+str[property]+" "+property;
              if (res.names_relation) res.names_relation+=","+property;
              else res.names_relation=property;
            break;
            default:
              if (res.complete_entity)
                res.complete_entity+=","+(prefix?prefix+".":"")+str[property]+" "+property;
              else res.complete_entity=(prefix?prefix+".":"")+str[property]+" "+property;
              if (res.names_entity) res.names_entity+=","+property;
              else  res.names_entity=property;
          }
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
          var w=d._what_;
          //relation
          if (w.indexOf('->')>=0 || w.indexOf('<-')>=0){
            if (w.charAt(0)=='['){
              w=w.substring(1,w.length-1);
              d._is_array_=true;
            }
            if (w.charAt(0)=='*'){
              w=w.substring(1,w.length);
              d._recursive_=true;
            }
            else if (w.charAt(w.length-1)=='*'){
              w=w.substring(0,w.length-1);
              d._recursive_=true;
            }
            if (w.charAt(0)=='<'){
              w=w.substring(2,w.length);
              d._relation_='<-';
            }
            else if (w.charAt(w.length-1)=='>'){
              w=w.substring(0,w.length-2);
              d._relation_='->';
            }
            d._type_=w;
            if (res) res.push(d);
            else res=[d];
          }
          else if (d._what_.charAt(0)=='['){
            //array of properties
            d._is_array_=true;
            d._type_=w.substring(1,w.length-1);
            if (res) res.push(d);
            else res=[d];
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
            var select=get_simple_fields(d);
            //If no detailed fields, we assume it is the "value"
            if (select==null) select={names:property,complete:"value "+property}
            if (!res) res=query;
            res="select sq"+i+".*,"+select.names+" from ("+res+
              ") sq"+i+" left join (select entity _idp_,"+select.complete+
              " from property_"+MODEL.get_type_property(d._what_)+"_"+node_id+
              " where property='"+d._what_+"') q"+i+" on sq"+i+"._id_=q"+i+"._idp_";
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
  console.log('process_row '+i+','+j);
  if (i>=rows.length) callback(null,rows);
  else if (j>=subqueries.length){
    delete rows[i]._id_;
    process_row(db,rows,i+1,subqueries,0,callback);
  }
  else if (rows[i]._id_){
    var s=subqueries[j];
    var select=get_simple_fields(s);
    var sq=get_subqueries(s);
    var sql;
    switch(s._relation_){
      case '->': sql="select id2 _id_,node _node_"+
      (select&&select.complete_relation?","+select.complete_relation:"")+
      " from relation_"+node_id+
      " where relation=? and id1=?";
      break;
      case '<-': sql="select id1 _id_"+
      (select&&select.complete_relation?","+select.complete_relation:"")+
      " from relation_"+node_id+
      " where relation=? and id2=?";
      break;
      default:  sql="select "+(select?select.complete:"value")+
      " from property_"+MODEL.get_type_property(s._type_)+"_"+node_id+
      " where property=? and entity=?";
      break;
    }
    if (s._relation_ && select && select.complete_entity && !sq){
      sql="select r.*,"+select.complete_entity+
      " from ("+sql+") r left join entity_"+node_id+" on r._id_=entity_"+node_id+".id"
    }
    console.log(sql);
    db.all(sql,[s._type_,rows[i]._id_],function(err,rows_sq){
      if (err) callback(err);
      else{
        if (rows_sq.length>0){
          if (s._relation_){
            if (select) {
              for (var k=0;k<rows_sq.length;k++)
                delete rows_sq[k]._id_;
              rows[i][s._entry_name_]=rows_sq;
            }
            else {
              var l=[];
              for (var k=0;k<rows_sq.length;k++)
                l.push(rows_sq[k]._id_);
              rows[i][s._entry_name_]=l;
            }
          }
          else{//properties
            if (s._is_array_){
                if (select) rows[i][s._entry_name_]=rows_sq;
                else{
                  var l=[];
                  for (var k=0;k<rows_sq.length;k++) l.push(rows_sq[k].value);
                  rows[i][s._entry_name_]=l;
                }
            }
            else rows[i][s._entry_name_]=rows_sq[0].value;
          }
        }
        process_row(db,rows,i,subqueries,j+1,callback);
      };
    });
  }
  //strange case, when join returns multiple rows
  else process_row(db,rows,i+1,subqueries,0,callback);
}
