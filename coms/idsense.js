var moment = require("moment-timezone");

exports.send=function(socket,command,data){
	switch(command){
		case 'card_insert':data.cmd=2;break;
		case 'record_insert':data.cmd=3;break;
	}
	data.seq=socket.spec_info.seq;
	var str=JSON.stringify(data);
	socket.write(str);
	socket.spec_info.seq++;
}

exports.ack=function(frame,socket){exports.nack(frame,socket,1);}

exports.nack=function(frame,socket,code){
	var str=JSON.stringify({seq:frame.seq,ack:code,cmd:frame.cmd});
	socket.write(str);
}

exports.receive=function(data,socket,inputs_service){
	if (data.ack){
		//Something to do?
	}
	else switch(data.cmd){
		case 4:new_clocking(data,socket,inputs_service);
	}
}

function new_clocking(data,socket,inputs_service){
	var info=socket.spec_info;
	var clocking={serial:info.serial,owner:data.id,card:data.card,result:data.resp,source:0};
	clocking.reception = moment.tz(new Date().getTime(),"GMT").format('YYYYMMDDHHMMSS');;
	clocking.gmt=moment.tz(data.tmp,"GMT").format('YYYYMMDDHHMMSS');
	clocking.tmp= moment.tz(data.tmp,info.timezone).format('YYYYMMDDHHMMSS');

	inputs_service.create_clocking(clocking,info.customer,function(err){
		if (err){
			console.log(err.message);
		 	exports.nack(data,socket,0);
	 	}
		else exports.ack(data,socket);
	})
}
