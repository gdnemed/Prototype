var net=require('net');
var msgpack = require("msgpack-lite");
var clients = {};
var tables_versions={records:0,cards:0,time_types:0};

var server;
var idsense;
var logic_service;

exports.init=function(listen,logic){
	idsense=require('./idsense');
	logic_service=logic;
	server = net.createServer(listen_function).listen(listen.port, listen.host);
	console.log('coms listening at '+listen.host+":"+listen.port);
}

function listen_function(socket) {
	var info={name: socket.remoteAddress + ":" + socket.remotePort};
	socket.spec_info=info;
	//We still don't know its name, so we put it in the map using tcp address
	clients['tcp'+info.name]=socket;

	socket.on('data', function(data){receive(data,socket)});
	socket.on('close',function(err){on_close(err,socket)});
	socket.on('error',function(err){on_error(err,socket)});
}

function on_error(err,socket){
	console.log(socket.spec_info.name+":"+err.message);
}

function on_close(err,socket){
	try{
		//remove socket from the map. If initialized, use id, otherwise, name
		if (socket.spec_info.serial) delete clients['id'+socket.spec_info.serial];
		else delete clients['tcp'+socket.spec_info.name];
		console.log(socket.spec_info.name + " closed");
	}
	catch(e){
		console.log(e.message);
	}
}

function receive(data_buffer,socket){
	//var data=JSON.parse(data_buffer.toString('utf-8'));
	var data=msgpack.decode(data_buffer);
	var info=socket.spec_info;
	console.log('socket '+info.name);
	console.log(data);
	//each type of terminal, needs its own processing
	switch(info.type){
		case 'idSense':idsense.receive(data,socket,logic_service);
			break;
		default:generic_receive(data,socket);
	}
}

/**Receive function when terminal type and serial are still unknown.
*/
function generic_receive(frame,socket){
	var info=socket.spec_info;
	info.type='idSense';
	info.serial=frame.serial;
	info.customer='SPEC';
	info.protocol=frame.protocol;
	info.timezone='Europe/Madrid';
	info.seq=1;
	info.identified=true;
	info.tables_versions={records:0,cards:0,time_types:0};
  if (info.serial!=null && frame.cmd==1){
  	//Change position in the map. Now we use id
  	clients['id'+info.serial]=socket;
  	delete clients['tcp'+info.name];
		switch(info.type){
			case 'idSense':idsense.ack(frame,socket);
				break;
			default:
		}
		logic_service.init_terminal(info.serial);
		//check_versions(info) <-with versions
  }
}

exports.global_send=function(command,data){
	for (var property in clients) {
    if (clients.hasOwnProperty(property)) {
			var socket=clients[property];
			if (socket.spec_info.identified) send_data(socket,command,data);
    }
	}
}

exports.send=function(serial,command,data,callback){
	var socket=clients['id'+serial];
	if (socket){
		send_data(socket,command,data);
		callback();
	}
	else callback('Serial not found');
}

function send_data(socket,command,data){
	//each type of terminal, needs its own processing
	switch(socket.spec_info.type){
		case 'idSense':idsense.send(socket,command,data);
			break;
	}
}

/**Compares server versions of the tables with terminal versions.
If the table of the terminal it out of date, starts an upload process.
*/
function check_versions(spec_info){
	for (var tab in tables_versions) {
    if (tables_versions.hasOwnProperty(tab)) {
			var sv=tables_versions[tab];
			var tv=spec_info.tables_versions[tab];
			if (tv<sv) logic_service.get_pending_registers(tab,tv,spec_info.customer,node_id,spec_info.serial);
    }
	}
}
