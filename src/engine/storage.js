/* Shared: storage adapter (localStorage now; remote KV scaffold for later) */
class StorageAdapter {
  async load(){ throw new Error("not implemented"); }
  async save(){ throw new Error("not implemented"); }
  async clear(){ throw new Error("not implemented"); }
}
class LocalStorageAdapter extends StorageAdapter {
  constructor(key){ super(); this.key = key; }
  async load(){ try { var raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
  async save(data){ try { localStorage.setItem(this.key, JSON.stringify(data)); return true; } catch(e){ return false; } }
  async clear(){ try { localStorage.removeItem(this.key); } catch(e){} }
}
/* Scaffold for a public key/value server secured by a bearer token (not wired yet). */
class RemoteKVAdapter extends StorageAdapter {
  constructor(opts){ super(); this.baseUrl=(opts.baseUrl||"").replace(/\/+$/,""); this.namespace=opts.namespace||"default"; this.key=opts.key; this.token=opts.token||null; }
  setToken(t){ this.token=t; }
  _url(){ return this.baseUrl+"/"+encodeURIComponent(this.namespace)+"/"+encodeURIComponent(this.key); }
  _headers(){ var h={"Content-Type":"application/json"}; if(this.token) h["Authorization"]="Bearer "+this.token; return h; }
  async load(){ var res=await fetch(this._url(),{headers:this._headers()}); if(res.status===404) return null; if(!res.ok) throw new Error("load failed: "+res.status); var b=await res.json(); return (b&&Object.prototype.hasOwnProperty.call(b,"value"))?b.value:b; }
  async save(data){ var res=await fetch(this._url(),{method:"PUT",headers:this._headers(),body:JSON.stringify(data)}); if(!res.ok) throw new Error("save failed: "+res.status); return true; }
  async clear(){ await fetch(this._url(),{method:"DELETE",headers:this._headers()}); }
}
var STORE_CONFIG = { mode:"local", key: CHARACTER.storageKey, remote:{ baseUrl:"", namespace:"dnd", token:"" } };
function makeStore(cfg){ if(cfg.mode==="remote" && cfg.remote.baseUrl){ return new RemoteKVAdapter({baseUrl:cfg.remote.baseUrl,namespace:cfg.remote.namespace,key:cfg.key,token:cfg.remote.token}); } return new LocalStorageAdapter(cfg.key); }
var store = makeStore(STORE_CONFIG);
