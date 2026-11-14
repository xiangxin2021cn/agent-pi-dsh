import assert from 'node:assert/strict'
import {test} from 'node:test'
import {useTrustedHosts} from '../vendor/dshmarket/lib/index.js'
import {refuseUnadmitted} from '../vendor/dshmarket/lib/http.js'

test('market rc.3 admission retains owner-only access and fails closed on revoked or invalid authentication', () => {
  let result = {rejection: 401}
  const connection = {admit() { if(result instanceof Error) throw result; return result }}
  const restore = useTrustedHosts({get: () => connection})
  try {
    for (const [admission, expected] of [[{rejection: 401},401],[{rejection: 503},503],[{peer:{principal:{kind:'external'},signal:{aborted:false}}},403],[{peer:{principal:{kind:'owner'},signal:{aborted:true}}},403],[new Error('fixture'),403],[{peer:{principal:{kind:'owner'},signal:{aborted:false}}},undefined]]) {
      result=admission
      const response = {writeHead(status) {this.status=status},end() {}}
      assert.equal(refuseUnadmitted({headers:{}},response),expected!==undefined)
      assert.equal(response.status,expected)
    }
  } finally {restore()}
})

test('market routes reuse the carrier authenticated live owner Peer without repeating legacy admission', () => {
  const restore = useTrustedHosts({get: () => ({admit() {throw new Error('must not readmit the raw Node request')}})})
  try {
    for (const [kind,aborted,status] of [['owner',false,undefined],['owner',true,401],['external',false,403]]) {
      const response={writeHead(value){this.status=value},end(){}}
      assert.equal(refuseUnadmitted({headers:{}},response,{principal:{kind},signal:{aborted}}),status!==undefined)
      assert.equal(response.status,status)
    }
  } finally {restore()}
})
