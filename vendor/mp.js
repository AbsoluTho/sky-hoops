/* Conexão online dos jogos (Sky Hoops e Oval Turbo).
   Imita a parte da API do PeerJS que os jogos usam (Peer, connect, send, eventos),
   mas as mensagens passam por servidores públicos de MQTT via WebSocket seguro.
   Funciona em qualquer rede (4G, Wi-Fi diferentes), sem conta.
   Usa dois servidores ao mesmo tempo e descarta mensagens repetidas:
   se um estiver fora do ar, o outro mantém a partida. */
(function(){
 const BROKERS=['wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt'];
 const NS='gpfam1/';
 const rid=()=>Math.random().toString(36).slice(2,10);
 class Emitter{constructor(){this._h={}}on(e,f){(this._h[e]=this._h[e]||[]).push(f);return this}emit(e,...a){(this._h[e]||[]).slice().forEach(f=>{try{f(...a)}catch(x){console.error(x)}})}}
 class Conn extends Emitter{
  constructor(peer,remote){super();this._p=peer;this.peer=remote;this.open=false}
  send(d){if(this.open)this._p._pub(this.peer,{k:'data',d})}
  close(){if(this.open){this._p._pub(this.peer,{k:'close'});this._closed()}}
  _closed(){if(!this.open)return;this.open=false;delete this._p._conns[this.peer];this.emit('close')}
 }
 class Peer extends Emitter{
  constructor(id){
   super(); this.id=id||('c-'+rid()); this._conns={}; this._seen=new Set(); this._seenQ=[]; this._seq=0; this._dead=false; this._opened=false; this._pending={};
   const will={topic:NS+this.id+'/p',payload:'gone',qos:1,retain:false};
   this._clients=BROKERS.map(url=>{
    let c; try{c=mqtt.connect(url,{clientId:'gp_'+rid()+rid(),clean:true,keepalive:20,reconnectPeriod:2500,connectTimeout:8000,will})}catch(e){return null}
    c.on('connect',()=>{c.subscribe(NS+this.id+'/in',{qos:1});Object.keys(this._conns).forEach(r=>c.subscribe(NS+r+'/p',{qos:1}));if(!this._opened&&!this._dead){this._opened=true;this.emit('open',this.id)}});
    c.on('message',(t,buf)=>this._msg(t,buf));
    c.on('error',()=>{});
    return c;
   }).filter(Boolean);
   this._failT=setTimeout(()=>{if(!this._opened&&!this._dead)this.emit('error',{type:'network'})},12000);
  }
  _raw(topic,obj){const s=typeof obj==='string'?obj:JSON.stringify(obj);this._clients.forEach(c=>{if(c.connected)c.publish(topic,s,{qos:1})})}
  _pub(remote,obj){obj.f=this.id;obj.m=this.id+':'+(++this._seq);this._raw(NS+remote+'/in',obj)}
  _watch(remote){this._clients.forEach(c=>{if(c.connected)c.subscribe(NS+remote+'/p',{qos:1})})}
  _unwatch(remote){this._clients.forEach(c=>{if(c.connected)c.unsubscribe(NS+remote+'/p')})}
  _msg(topic,buf){
   if(this._dead)return;
   const s=buf.toString();
   if(topic.endsWith('/p')){const r=topic.slice(NS.length,-2);const cn=this._conns[r];if(s==='gone'&&cn){this._unwatch(r);cn._closed()}return}
   let o; try{o=JSON.parse(s)}catch(e){return}
   if(!o||!o.m||this._seen.has(o.m))return;
   this._seen.add(o.m);this._seenQ.push(o.m);if(this._seenQ.length>3000)this._seen.delete(this._seenQ.shift());
   const f=o.f;
   if(o.k==='hi'){
    let cn=this._conns[f];
    if(!cn){cn=new Conn(this,f);this._conns[f]=cn;this._watch(f)}
    this._pub(f,{k:'ok'});
    if(!cn.open){cn.open=true;this.emit('connection',cn);cn.emit('open')}
   } else if(o.k==='ok'){
    const cn=this._conns[f]; if(cn&&!cn.open){clearTimeout(this._pending[f]);cn.open=true;cn.emit('open')}
   } else if(o.k==='data'){
    const cn=this._conns[f]; if(cn&&cn.open)cn.emit('data',o.d);
   } else if(o.k==='close'){
    const cn=this._conns[f]; if(cn){this._unwatch(f);cn._closed()}
   }
  }
  connect(remote){
   const cn=new Conn(this,remote); this._conns[remote]=cn;
   const hello=()=>{this._watch(remote);this._pub(remote,{k:'hi'})};
   if(this._opened)hello();else this.on('open',hello);
   // repete o "oi" algumas vezes até a sala responder
   let tries=0; const again=setInterval(()=>{if(cn.open||this._dead||++tries>4){clearInterval(again);return}this._pub(remote,{k:'hi'})},1800);
   this._pending[remote]=setTimeout(()=>{clearInterval(again);if(!cn.open&&!this._dead){delete this._conns[remote];this.emit('error',{type:'peer-unavailable'})}},11000);
   return cn;
  }
  reconnect(){}
  destroy(){
   if(this._dead)return; this._dead=true; clearTimeout(this._failT);
   Object.keys(this._conns).forEach(r=>{try{this._pub(r,{k:'close'})}catch(e){}});
   this._raw(NS+this.id+'/p','gone');
   setTimeout(()=>this._clients.forEach(c=>{try{c.end(true)}catch(e){}}),300);
  }
 }
 window.Peer=Peer;
})();
