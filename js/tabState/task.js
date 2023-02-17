const TabList = require('tabState/tab.js')
const TabStack = require('tabRestore.js')

class TaskList {
  constructor () {
    this.tasks = [] // each task is {id, name, tabs: [], tabHistory: TabStack}
    this.events = []
    this.pendingCallbacks = []
    this.pendingCallbackTimeout = null
  }

  on (name, fn) {
    this.events.push({ name, fn })
  }

  static temporaryProperties = ['selectedInWindow']

  emit (name, ...data) {
    this.events.forEach(listener => {
      if (listener.name === name || listener.name === '*') {
        this.pendingCallbacks.push([listener.fn, (listener.name === '*' ? [name] : []).concat(data)])

        // run multiple events in one timeout, since calls to setTimeout() appear to be slow (at least based on timeline data)
        if (!this.pendingCallbackTimeout) {
          this.pendingCallbackTimeout = setTimeout(() => {
            this.pendingCallbacks.forEach(t => t[0].apply(this, t[1]))
            this.pendingCallbacks = []
            this.pendingCallbackTimeout = null
          }, 0)
        }
      }
    })
  }

  add (task = {}, index, emit = true) {
    const newTask = {
      name: task.name || null,
      tabs: new TabList(task.tabs, this),
      tabHistory: new TabStack(task.tabHistory),
      collapsed: task.collapsed, // this property must stay undefined if it is already (since there is a difference between "explicitly uncollapsed" and "never collapsed")
      id: task.id || String(TaskList.getRandomId()),
      selectedInWindow: task.selectedInWindow || null,
    }

    if (index) {
      this.tasks.splice(index, 0, newTask)
    } else {
      this.tasks.push(newTask)
    }

    if (emit) {
      this.emit('task-added', newTask.id, Object.assign({}, newTask, { tabHistory: task.tabHistory, tabs: task.tabs }), index)
    }

    return newTask.id
  }

  getStringifyableState () {
    return {
      tasks: this.tasks.map(task => Object.assign({}, task, { tabs: task.tabs.getStringifyableState() })).map(function(task) {
        //remove temporary properties from task
        let result = {}
        Object.keys(task)
        .filter(key => !TaskList.temporaryProperties.includes(key))
        .forEach(key => result[key] = task[key])
        return result
      })
    }
  }

  getCopyableState () {
    return {
      tasks: this.tasks.map(task => Object.assign({}, task, {tabs: task.tabs.tabs}))
    }
  }

  get (id) {
    return this.find(task => task.id === id) || null
  }

  getSelected () {
    return this.find(task => task.selectedInWindow === windowId)
  }

  byIndex (index) {
    return this.tasks[index]
  }

  getTaskContainingTab (tabId) {
    return this.find(task => task.tabs.has(tabId)) || null
  }

  getIndex (id) {
    return this.tasks.findIndex(task => task.id === id)
  }

  setSelected (id, emit = true, onWindow=windowId) {
    for (var i = 0; i < this.tasks.length; i++) {
      if (this.tasks[i].selectedInWindow === onWindow) {
        this.tasks[i].selectedInWindow = null
      }
      if (this.tasks[i].id === id) {
        this.tasks[i].selectedInWindow = onWindow
      }
    }
    if (onWindow === windowId) {
      window.tabs = this.get(id).tabs
      if (emit) {
        this.emit('task-selected', id)
        if (tabs.getSelected()) {
          this.emit('tab-selected', tabs.getSelected(), id)
        }
      }
    }
  }

  destroy (id, emit = true) {
    const index = this.getIndex(id)

    if (emit) {
    // emit the tab-destroyed event for all tabs in this task
      this.get(id).tabs.forEach(tab => this.emit('tab-destroyed', tab.id, id))

      this.emit('task-destroyed', id)
    }

    if (index < 0) return false

    this.tasks.splice(index, 1)
  
    return index
  }

  getLastActivity (id) {
    var tabs = this.get(id).tabs
    var lastActivity = 0

    for (var i = 0; i < tabs.count(); i++) {
      if (tabs.getAtIndex(i).lastActivity > lastActivity) {
        lastActivity = tabs.getAtIndex(i).lastActivity
      }
    }

    return lastActivity
  }

  isCollapsed (id) {
    var task = this.get(id)
    return task.collapsed || (task.collapsed === undefined && Date.now() - tasks.getLastActivity(task.id) > (7 * 24 * 60 * 60 * 1000))
  }

  getLength () {
    return this.tasks.length
  }

  map (fun) { return this.tasks.map(fun) }

  forEach (fun) { return this.tasks.forEach(fun) }

  indexOf (task) { return this.tasks.indexOf(task) }

  slice (...args) { return this.tasks.slice.apply(this.tasks, args) }

  splice (...args) { return this.tasks.splice.apply(this.tasks, args) }

  filter (...args) { return this.tasks.filter.apply(this.tasks, args) }

  find (filter) {
    for (var i = 0, len = this.tasks.length; i < len; i++) {
      if (filter(this.tasks[i], i, this.tasks)) {
        return this.tasks[i]
      }
    }
  }

  static getRandomId () {
    return Math.round(Math.random() * 100000000000000000)
  }
}

module.exports = TaskList
