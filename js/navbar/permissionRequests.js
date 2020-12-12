const webviews = require('webviews.js')

const permissionRequests = {
  requests: [],
  listeners: [],
  grantPermission: function (permissionId) {
    permissionRequests.requests.forEach(function (request) {
      if (request.permissionId && request.permissionId === permissionId) {
        ipc.send('permissionGranted', permissionId)
      }
    })
  },
  getIcons: function (request) {
    if (request.permission === 'notifications') {
      return ['carbon:chat']
    } else if (request.permission === 'media') {
      const mediaIcons = {
        video: 'carbon:video',
        audio: 'carbon:microphone'
      }
      return request.details.mediaTypes.map(t => mediaIcons[t])
    }
  },
  getButtons: function (tabId) {
    const buttons = []
    permissionRequests.requests.forEach(function (request) {
      if (request.tabId === tabId) {
        const button = document.createElement('button')
        button.className = 'tab-icon permission-request-icon'
        if (request.granted) {
          button.classList.add('active')
        }
        permissionRequests.getIcons(request).forEach(function (icon) {
          const el = document.createElement('i')
          el.className = 'i ' + icon
          button.appendChild(el)
        })
        button.addEventListener('click', function (e) {
          e.stopPropagation()
          if (request.granted) {
            webviews.callAsync(tabId, 'reload')
          } else {
            permissionRequests.grantPermission(request.permissionId)
            button.classList.add('active')
          }
        })
        buttons.push(button)
      }
    })
    return buttons
  },
  onChange: function (listener) {
    permissionRequests.listeners.push(listener)
  },
  initialize: function () {
    ipc.on('updatePermissions', function (e, data) {
      const oldData = permissionRequests.requests
      permissionRequests.requests = data
      oldData.forEach(function (req) {
        permissionRequests.listeners.forEach(listener => listener(req.tabId))
      })
      permissionRequests.requests.forEach(function (req) {
        permissionRequests.listeners.forEach(listener => listener(req.tabId))
      })
    })
  }
}

permissionRequests.initialize()

module.exports = permissionRequests
