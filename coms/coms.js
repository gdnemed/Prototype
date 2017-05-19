var net=require('net');
var clients = {};
var server;
var idsense;
var inputs_service;

exports.init=function(listen,inputs){
	idsense=require('./idsense');
	inputs_service=inputs;
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
	var data=JSON.parse(data_buffer.toString('utf-8'));
	var info=socket.spec_info;
	console.log('socket '+info.name);
	console.log(data);
	//each type of terminal, needs its own processing
	switch(info.type){
		case 'idSense':idsense.receive(data,socket,inputs_service);
			break;
		default:generic_receive(data,socket);
	}
}

function generic_receive(frame,socket){
	var info=socket.spec_info;
	info.type='idSense';
	info.serial=frame.serial;
	info.customer='SPEC';
	info.protocol=frame.protocol;
	info.timezone='Europe/Madrid';
	info.seq=1;
	info.identified=true;
  if (info.serial!=null && frame.cmd==1){
  	//Change position in the map. Now we use id
  	clients['id'+info.serial]=socket;
  	delete clients['tcp'+info.name];
		switch(info.type){
			case 'idSense':idsense.ack(frame,socket);
				break;
			default:
		}
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

exports.send=function(id,command,data,res){
	var socket=clients['id'+id];
	if (socket){
		send_data(socket,command,data);
		res.status(200).end();
	}
	else res.status(404).end();
}

function send_data(socket,command,data){
	//each type of terminal, needs its own processing
	switch(socket.spec_info.type){
		case 'idSense':idsense.send(socket,command,data);
			break;
	}
}
