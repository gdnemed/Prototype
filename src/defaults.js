const addDefaults = () => {
  let defaults = {
    LEMURIA_DIR_DB: '.',
    LEMURIA_PORT_API: 8081,
    LEMURIA_PORT_COMS: 8092,
    LEMURIA_HOST_SERVER: '127.0.0.1',
    LEMURIA_PORT_SERVER: 8081,
    LEMURIA_DIR_FILES: './remote',
    LEMURIA_DIR_WORK: '.',
    LEMURIA_PERIOD_CLOCKINGS: 1,
    LEMURIA_FILE_CLOCKINGS: 'clk.csv',
    LEMURIA_PORT_API_EMULATOR: 8099,
    LEMURIA_REGISTRY_URL: '127.0.0.1:8081',
    LEMURIA_BOOT_SERVICES: ''
  }
  for (let p in defaults) {
    if (defaults.hasOwnProperty(p)) {
      process.env[p] = process.env[p] || defaults[p]
    }
  }
}

module.exports = {
  addDefaults
}
