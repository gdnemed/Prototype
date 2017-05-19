const crypto = require('crypto');
const hash;
const key_generator;
var cipher;
var decipher;
var public_key;
var speakers={};

init('aes-256-ctr','d6F3Efeq',crypto.randomBytes(16));

function init(algorithm,password,iv){
  key_generator = crypto.createECDH('secp521r1');
  key_generator.generateKeys();
  public_key=key_generator.getPublicKey();

  hash = crypto.createHash('sha256');

  hash.update('some data to hash');
  console.log(hash.digest('hex'));

  if (iv){
    cipher = crypto.createCipheriv(algorithm,password,iv);
    decipher = crypto.createDecipher(algorithm,password,iv);
  }
  else{
    cipher = crypto.createCipher(algorithm,password);
    decipher = crypto.createDecipher(algorithm,password);
  }
}

/////Generic encryption/decryption and hash////////
function encrypt(text){
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text){
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

function hast_data(data){
  hash.update(data);
  return hash.digest('hex');
}
/////////////////////////////////////////

//////Talking with others////////////////
function get_public_key(){
  return public_key;
}

function init_transmission(speaker,speaker_public_key){
  var secret=key_generator.computeSecret(speaker_public_key);
  var cipher = crypto.createCipheriv(algorithm,secret);
  var decipher = crypto.createDecipher(algorithm,secret);
  speakers[speaker]={secret:secret,cipher:cipher,decipher:decipher};
}

function encrypt(speaker,text){
  var str=speakers[speaker];
  var crypted = str.cipher.update(text,'utf8','hex')
  crypted += str.cipher.final('hex');
  return crypted;
}

function decrypt(speaker,text){
  var str=speakers[speaker];
  var dec = str.decipher.update(text,'hex','utf8')
  dec += str.decipher.final('utf8');
  return dec;
}
///////////////////////////////////////////
