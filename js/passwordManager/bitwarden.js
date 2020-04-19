const settings = require('util/settings/settings.js')
const ProcessSpawner = require('util/process.js')

// Bitwarden password manager. Requires session key to unlock the vault.
class Bitwarden {
    constructor() {
      this.sessionKey = null
      this.lastCallList = {}
      this.name = 'Bitwarden'
    }
  
    // Returns a Bitwarden-CLI tool path by checking possible locations.
    // First it checks if the tool was installed for Min specifically by
    // by checking the settings value. If that is not set or doesn't point
    // to a valid executable, it check the if 'bw' is available globally.
    async _getToolPath() {
      let localPath = settings.get('bitwardenPath')
      if (localPath) {
        let local = false;
        try {
          await fs.promises.access(localPath, fs.constants.X_OK)
          local = true;
        } catch (e) {}
        if (local) {
          return localPath
        }
      }
  
      let global = new ProcessSpawner('bw').checkCommandExists()
    
      if (global) {
        return 'bw'
      }
  
      return null
    }
  
    // Checks if Bitwarden integration is configured properly by trying to
    // obtain a valid Bitwarden-CLI tool path.
    async checkIfConfigured() {
      this.path = await this._getToolPath()
      return this.path != null
    }
  
    // Returns current Bitwarden-CLI status. If we have a session key, then
    // password store is considered unlocked.
    isUnlocked() {
      return this.sessionKey != null
    }
  
    // Tries to get a list of credential suggestions for a given domain name.
    // If password store is locked, the method will try to unlock it by
    async getSuggestions(domain) {
      if (this.lastCallList[domain] != null) {
        return this.lastCallList[domain]
      }
  
      let command = this.path
      if (!command) {
        return Promise.resolve([])
      }
  
      let start = null
      if (this.sessionKey == null) {
        start = this.tryToUnlock(command)
      } else {
        start = Promise.resolve(this.sessionKey)
      }
  
      this.lastCallList[domain] = start.then(() => this.loadSuggestions(command, domain)).then(suggestions => {
        this.lastCallList[domain] = null
        return suggestions
      }).catch(ex => {
        this.lastCallList[domain] = null
      })
  
      return this.lastCallList[domain]
    }
  
    // Loads credential suggestions for given domain name.
    async loadSuggestions(command, domain) {
      try {
        let process = new ProcessSpawner(command, ['list', 'items', '--url', this.sanitize(domain), '--session', this.sessionKey])
        let data = await process.execute()
  
        const matches = JSON.parse(data)
        let credentials = matches.map(match => {
          const { login: { username, password } } = match
          return { username, password, manager: 'Bitwarden' }
        })
  
        return credentials
      } catch (ex) {
        const { error, data } = ex
        console.error('Error accessing Bitwarden CLI. STDOUT: ' + data + '. STDERR: ' + error)
        return []
      }
    }
  
    // Tries to unlock the store by asking for a master password and
    // then passing that to Bitwarden-CLI to get a session key.
    async tryToUnlock(command) {
      let sessionKey = null
      while (!sessionKey) {
        let password
        try {
        password = await this.promptForMasterPassword()
        } catch (e) {
          //dialog was canceled
          break
        }
        try {
        sessionKey = await this.unlockStore(command, password)
        } catch (e) {
          //incorrect password, prompt again
        }
      }
      this.sessionKey = sessionKey
      this.forceSync(command)
    }
  
    async forceSync(command) {
      try {
        let process = new ProcessSpawner(command, ['sync', '--session', this.sessionKey])
        await process.execute()
      } catch (ex) {
        const { error, data } = ex
        console.error('Error accessing Bitwarden CLI. STDOUT: ' + data + '. STDERR: ' + error)
        throw ex
      }
    }
  
    // Tries to unlock the password store with given master password.
    async unlockStore(command, password) {
      try {
        let process = new ProcessSpawner(command, ['unlock', '--raw', password])
        let result = await process.execute()
        return result
      } catch (ex) {
        const { error, data } = ex
        console.error('Error accessing Bitwarden CLI. STDOUT: ' + data + '. STDERR: ' + error)
        throw ex
      }
    }
  
    // Shows a prompt dialog for password store's master password.
    async promptForMasterPassword() {
      return new Promise((resolve, reject) => {
        let {password} = ipc.sendSync('prompt', {
           text: l('passwordManagerUnlock').replace("%p", "Bitwarden"),
           values: [{ placeholder: l('password'), id: 'password', type: 'password' }],
           ok: l('dialogConfirmButton'),
           cancel: l('dialogSkipButton'),
           height: 160,
          })
        if (password == null || password == '') {
          reject()
        } else {
          resolve(password)
        }
      })
    }
  
    // Basic domain name cleanup. Removes any non-ASCII symbols.
    sanitize(domain) {
      return domain.replace(/[^a-zA-Z0-9.-]/g, '')
    }
  }

  module.exports = Bitwarden