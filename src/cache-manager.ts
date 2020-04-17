import http from 'http'
import Cache from 'hybrid-disk-cache'
import { CommandArg, HandlerConfig } from './types'
import { fork, log } from './utils'

// prevent same url being revalidated multiple times
const queue = new Set<string>()
let interval: NodeJS.Timeout
let conf: HandlerConfig

function revalidate(uri: string) {
  const url = `http://${conf.hostname || 'localhost'}:${conf.port}` + uri
  if (queue.has(url)) return

  queue.add(url)
  http.get(url, { headers: { 'x-cache-status': 'update' } }, () => {
    queue.delete(url)
  })
}

function initPurge() {
  if (interval) return
  const cache = new Cache(conf.cache)
  const tbd = 3600
  console.log('> Cache manager inited, will start to purge in %ds', tbd)
  interval = setInterval(() => {
    const start = process.hrtime()
    const rv = cache.purge()
    log(start, 'prg', `purged all ${rv} inactive record(s)`)
  }, tbd * 1000)
}

process.on('message', (cmd: CommandArg) => {
  if (cmd.action === 'revalidate') {
    revalidate(cmd.payload)
  } else {
    conf = cmd.payload
    initPurge()
  }
})

export interface CacheManager {
  init(conf: HandlerConfig): void
  revalidate(url: string): void
  kill(signal?: NodeJS.Signals | number): boolean
}

export default (): CacheManager => {
  const cp = fork(__filename)
  return {
    init(conf) {
      cp.send({ action: 'init', payload: conf })
    },
    revalidate(url) {
      cp.send({ action: 'revalidate', payload: url })
    },
    kill(signal) {
      return cp.kill(signal)
    },
  }
}
