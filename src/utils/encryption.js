const crypto = require('crypto')
var hash
var key_generator
var cipher
var decipher
var public_key
var speakers = {}

var crypt_parameters = {
  hash: 'sha256',
  hash_hmac: false,
  cipher: 'aes-256-ctr', // 'aes-128-cbc',
  key_type: 'ECDH',
  ECDHCurve: 'secp521r1'
}

init('d6F3Efeq'/*, crypto.randomBytes(16) */)

function init (password, iv) {
  // Keys generators
  if (crypt_parameters.ECDHCurve) { key_generator = crypto.createECDH(crypt_parameters.ECDHCurve) } else key_generator = crypto.createDiffieHellman(2048)
  key_generator.generateKeys()
  public_key = key_generator.getPublicKey()

  // Hash function
  if (crypt_parameters.hash_hmac) hash = crypto.createHmac(crypt_parameters.hash, password)
  else hash = crypto.createHash(crypt_parameters.hash)

  // Ciphers
  if (iv) {
    cipher = crypto.createCipheriv(crypt_parameters.cipher, password, iv)
    decipher = crypto.createDecipher(crypt_parameters.cipher, password, iv)
  } else {
    cipher = crypto.createCipher(crypt_parameters.cipher, password)
    decipher = crypto.createDecipher(crypt_parameters.cipher, password)
  }
}

/// //Generic encryption/decryption and hash////////
function encrypt (text) {
  var crypted = cipher.update(text, 'utf8', 'hex')
  crypted += cipher.final('hex')
  return crypted
}

function decrypt (text) {
  var dec = decipher.update(text, 'hex', 'utf8')
  dec += decipher.final('utf8')
  return dec
}

function hash_data (data) {
  hash.update(data)
  return hash.digest('hex')
}
/// //////////////////////////////////////

/// ///Talking with others////////////////
function get_public_key () {
  return public_key
}

function init_transmission (speaker, speaker_public_key) {
  var secret = key_generator.computeSecret(speaker_public_key)
  var cipher = crypto.createCipheriv(algorithm, secret)
  var decipher = crypto.createDecipher(algorithm, secret)
  speakers[speaker] = {secret: secret, cipher: cipher, decipher: decipher}
}

function encrypt (speaker, text) {
  var str = speakers[speaker]
  var crypted = str.cipher.update(text, 'utf8', 'hex')
  crypted += str.cipher.final('hex')
  return crypted
}

function decrypt (speaker, text) {
  var str = speakers[speaker]
  var dec = str.decipher.update(text, 'hex', 'utf8')
  dec += str.decipher.final('utf8')
  return dec
}
/// ////////////////////////////////////////
